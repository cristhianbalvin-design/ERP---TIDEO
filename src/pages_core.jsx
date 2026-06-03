import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { canUserSeeOwner, getAssignableUsers, getUserCategory, getUserHierarchyLevel } from './lib/hierarchy.js';
import { campanasService } from './services/campanasService.js';
import { maestrosService } from './services/maestrosService.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { PHONE_PATTERN, RUC_PATTERN, isValidPhone, isValidRuc, sanitizePhone, sanitizeRuc } from './lib/formValidators.js';

function computeNextMaterialCode(subfamiliaId, grupos, familias, subfamilias, materiales, empresaId) {
  const sub = subfamilias.find(s => s.id === subfamiliaId);
  if (!sub) return '';
  const fam = familias.find(f => f.id === sub.familia_id);
  if (!fam) return '';
  const grp = grupos.find(g => g.id === fam.grupo_id);
  if (!grp) return '';
  const prefix = String(grp.codigo || '').padStart(2, '0') + String(fam.codigo || '').padStart(2, '0') + String(sub.codigo || '').padStart(2, '0');
  const existentes = materiales.filter(m => m.subfamilia_id === subfamiliaId && (m.empresa_id === empresaId || !m.empresa_id) && typeof m.codigo === 'string' && m.codigo.length === 10 && m.codigo.startsWith(prefix));
  const maxCorr = existentes.reduce((max, m) => {
    const n = parseInt(m.codigo.slice(6), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return prefix + String(maxCorr + 1).padStart(4, '0');
}

// ─── MaterialAutocomplete ─────────────────────────────────────────────────────
// Busca en materiales (catálogo completo). Muestra stock como dato informativo.
// onSelect({ mat_id, nombre, unidad, costo_unit })
// onCreateNew(texto) → modal completo de creación
function MaterialAutocomplete({ value, onChange, materiales = [], inventario = [], style = {}, inlineOptions = false }) {
  const [query, setQuery] = useState(value?.nombre || '');
  const [open, setOpen] = useState(false);
  const [dropRect, setDropRect] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const ref = useRef(null);
  const {
    crearMaterialCtx, empresa, addNotificacion,
    materialGrupos = [], materialFamilias = [], materialSubfamilias = [], almacenes = [],
  } = useApp();
  const materialFormBase = { descripcion: '', unidad: '', grupo_id: '', familia_id: '', subfamilia_id: '', nro_parte: '', unidades_contenidas: '1', almacen_id: '', ubicacion: '', observacion: '', precio_unitario: '0', estado: 'activo' };
  const [modalForm, setModalForm] = useState(materialFormBase);
  const [modalError, setModalError] = useState('');
  const [creando, setCreando] = useState(false);

  useEffect(() => { setQuery(value?.nombre || ''); }, [value?.nombre]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (inlineOptions) return;
    if (open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  }, [inlineOptions, open, query]);

  const q = query.trim().toLowerCase();
  const resultados = q.length >= 2
    ? materiales.filter(m => m.estado !== 'inactivo' && (m.codigo?.toLowerCase().includes(q) || m.descripcion?.toLowerCase().includes(q) || m.nro_parte?.toLowerCase().includes(q))).slice(0, 12)
    : [];
  const showOptions = open && q.length >= 2;
  const optionsStyle = inlineOptions
    ? { width: '100%', maxHeight: 220 }
    : dropRect
      ? { minWidth: Math.max(dropRect.width, 320), maxWidth: 480, maxHeight: 280, top: dropRect.top, left: dropRect.left }
      : null;

  const seleccionar = (m) => {
    setQuery(m.descripcion);
    setOpen(false);
    const stockItem = inventario.find(i => i.material_id === m.id || i.sku === m.codigo);
    onChange({ mat_id: m.id, nombre: m.descripcion, unidad: m.unidad || '', costo_unit: Number(m.precio_unitario) || 0, stock: Number(stockItem?.cantidad ?? stockItem?.stock ?? 0) });
  };

  const abrirModal = (txt) => {
    setModalForm({ ...materialFormBase, descripcion: txt });
    setModalError('');
    setShowModal(true);
    setOpen(false);
  };

  const formFamilias = modalForm.grupo_id ? materialFamilias.filter(f => f.grupo_id === modalForm.grupo_id) : [];
  const formSubfamilias = modalForm.familia_id ? materialSubfamilias.filter(s => s.familia_id === modalForm.familia_id) : [];
  const codigoAuto = modalForm.subfamilia_id ? computeNextMaterialCode(modalForm.subfamilia_id, materialGrupos, materialFamilias, materialSubfamilias, materiales, empresa?.id) : '';

  const guardarNuevo = async () => {
    if (!modalForm.grupo_id || !modalForm.familia_id || !modalForm.subfamilia_id) {
      setModalError('Selecciona grupo, familia y sub-familia para generar el codigo del maestro.');
      return;
    }
    if (!modalForm.descripcion.trim() || !modalForm.unidad.trim()) {
      setModalError('Completa descripcion y unidad antes de guardar.');
      return;
    }
    if (!codigoAuto) {
      setModalError('No se pudo generar el codigo automatico para esta sub-familia.');
      return;
    }
    setCreando(true);
    setModalError('');
    try {
      const payload = {
        ...modalForm,
        codigo: codigoAuto,
        descripcion: modalForm.descripcion.trim(),
        unidad: modalForm.unidad.trim(),
        nro_parte: modalForm.nro_parte.trim() || null,
        unidades_contenidas: Number(modalForm.unidades_contenidas) || 1,
        almacen_id: modalForm.almacen_id || null,
        ubicacion: modalForm.ubicacion.trim() || null,
        observacion: modalForm.observacion.trim() || null,
        precio_unitario: Number(modalForm.precio_unitario) || 0,
      };
      const m = await crearMaterialCtx(payload);
      addNotificacion('Material creado.');
      seleccionar(m);
      setShowModal(false);
    } catch (err) {
      setModalError(err.message || 'No se pudo crear el material.');
      addNotificacion(err.message, 'error');
    } finally { setCreando(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        className="input"
        style={{ fontSize: 11, padding: '3px 5px', width: '100%' }}
        value={query}
        placeholder="Buscar material..."
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange({ mat_id: '', nombre: '', unidad: '', costo_unit: 0, stock: 0 }); }}
        onFocus={() => { if (q.length >= 2) setOpen(true); }}
      />
      {showOptions && optionsStyle && (
        <div className={`autocomplete-menu ${inlineOptions ? 'autocomplete-menu-inline' : 'autocomplete-menu-floating'}`} style={optionsStyle}>
          {resultados.map(m => {
            const stockItem = inventario.find(i => i.material_id === m.id || i.sku === m.codigo);
            const stock = Number(stockItem?.cantidad ?? stockItem?.stock ?? 0);
            return (
              <div key={m.id} onMouseDown={() => seleccionar(m)} className="autocomplete-option">
                <div className="autocomplete-option-title"><span className="mono autocomplete-code">{m.codigo}</span>{m.descripcion}</div>
                <div className="autocomplete-option-meta">{m.unidad} · Precio ref: S/ {Number(m.precio_unitario || 0).toFixed(2)} · <span>Stock: {stock} {m.unidad}</span></div>
              </div>
            );
          })}
          <div onMouseDown={() => abrirModal(query)} className="autocomplete-option autocomplete-create-option">
            + Crear material: "{query}"
          </div>
        </div>
      )}
      {showModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 860, width: 'min(860px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-head"><h2>Nuevo material</h2><button type="button" className="icon-btn" onClick={() => setShowModal(false)}>{I.x}</button></div>
            <div className="modal-body col" style={{ gap: 14, overflowY: 'auto' }}>
              {modalError && <div className="alert alert-danger">{modalError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="input-group">
                  <label>Grupo *</label>
                  <select className="select" value={modalForm.grupo_id} onChange={e => setModalForm(p => ({ ...p, grupo_id: e.target.value, familia_id: '', subfamilia_id: '' }))}>
                    <option value="">{materialGrupos.length ? 'Seleccionar...' : 'Sin grupos'}</option>
                    {materialGrupos.map(g => <option key={g.id} value={g.id}>{g.codigo} - {g.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Familia *</label>
                  <select className="select" value={modalForm.familia_id} onChange={e => setModalForm(p => ({ ...p, familia_id: e.target.value, subfamilia_id: '' }))} disabled={!modalForm.grupo_id}>
                    <option value="">Seleccionar...</option>
                    {formFamilias.map(f => <option key={f.id} value={f.id}>{f.codigo} - {f.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Sub-familia *</label>
                  <select className="select" value={modalForm.subfamilia_id} onChange={e => setModalForm(p => ({ ...p, subfamilia_id: e.target.value }))} disabled={!modalForm.familia_id}>
                    <option value="">Seleccionar...</option>
                    {formSubfamilias.map(s => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Codigo</label>
                  <input className="input" readOnly value={codigoAuto || '-'} style={{ color: 'var(--fg-muted)', background: 'var(--bg-subtle)', cursor: 'default' }} />
                </div>
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Descripcion *</label>
                  <input className="input" value={modalForm.descripcion} onChange={e => setModalForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Tornillo hexagonal M8x25mm" />
                </div>
                <div className="input-group">
                  <label>UM *</label>
                  <input className="input" value={modalForm.unidad} onChange={e => setModalForm(p => ({ ...p, unidad: e.target.value }))} placeholder="und, kg, m" />
                </div>
                <div className="input-group">
                  <label>Nro parte</label>
                  <input className="input" value={modalForm.nro_parte} onChange={e => setModalForm(p => ({ ...p, nro_parte: e.target.value }))} placeholder="Codigo del fabricante" />
                </div>
                <div className="input-group">
                  <label>Unidades contenidas</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={modalForm.unidades_contenidas} onChange={e => setModalForm(p => ({ ...p, unidades_contenidas: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Almacen por defecto</label>
                  <select className="select" value={modalForm.almacen_id} onChange={e => setModalForm(p => ({ ...p, almacen_id: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Ubicacion</label>
                  <input className="input" value={modalForm.ubicacion} onChange={e => setModalForm(p => ({ ...p, ubicacion: e.target.value }))} placeholder="Ej: Pasillo A, Estante 3" />
                </div>
                <div className="input-group">
                  <label>Precio unitario S/</label>
                  <input className="input" type="number" min="0" step="0.01" value={modalForm.precio_unitario} onChange={e => setModalForm(p => ({ ...p, precio_unitario: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Estado</label>
                  <select className="select" value={modalForm.estado} onChange={e => setModalForm(p => ({ ...p, estado: e.target.value }))}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Observacion</label>
                  <textarea className="input" rows={2} value={modalForm.observacion} onChange={e => setModalForm(p => ({ ...p, observacion: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={guardarNuevo} disabled={creando || !modalForm.grupo_id || !modalForm.familia_id || !modalForm.subfamilia_id || !modalForm.descripcion.trim() || !modalForm.unidad.trim()}>{creando ? 'Guardando...' : 'Guardar y seleccionar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ColaboradorAutocomplete ──────────────────────────────────────────────────
// Busca en personalOperativo + personalAdmin combinados.
// onSelect({ id, nombre, costo_hora, costo_hora_pen })
function ColaboradorAutocomplete({ value, onChange, personalOperativo = [], personalAdmin = [], monedaOT = 'PEN', tipoCambioHoy, style = {}, inlineOptions = false }) {
  const [query, setQuery] = useState(value?.nombre || '');
  const [open, setOpen] = useState(false);
  const [dropRect, setDropRect] = useState(null);
  const ref = useRef(null);

  useEffect(() => { setQuery(value?.nombre || ''); }, [value?.nombre]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (inlineOptions) return;
    if (open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  }, [inlineOptions, open, query]);

  const todos = getPersonalAsignableOT(personalOperativo, personalAdmin);
  const q = query.trim().toLowerCase();
  const resultados = q.length >= 2
    ? todos.filter(p => p.nombre?.toLowerCase().includes(q)).slice(0, 10)
    : [];

  const costoHoraPEN = (p) => {
    const explicit = Number(p?.tarifa_hora ?? p?.costo_hora_real ?? p?.costo ?? p?.costo_hora ?? 0);
    if (explicit > 0) return explicit;
    return 0;
  };

  const seleccionar = (p) => {
    setQuery(p.nombre);
    setOpen(false);
    const chPEN = costoHoraPEN(p);
    const esUSD = monedaOT === 'USD' && tipoCambioHoy?.usd;
    const ch = esUSD ? Math.round(chPEN * tipoCambioHoy.usd * 100) / 100 : chPEN;
    onChange({ id: p.id, nombre: p.nombre, costo_hora: ch, costo_hora_pen: chPEN });
  };

  const esOp = (p) => personalOperativo.some(op => op.id === p.id);
  const showOptions = open && q.length >= 2;
  const optionsStyle = inlineOptions
    ? { width: '100%', maxHeight: 190 }
    : dropRect
      ? { minWidth: Math.max(dropRect.width, 300), maxWidth: 440, maxHeight: 260, top: dropRect.top, left: dropRect.left }
      : null;

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        className="input"
        style={{ fontSize: 11, padding: '3px 5px', width: '100%' }}
        value={query}
        placeholder="Buscar colaborador..."
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange({ id: '', nombre: '', costo_hora: 0, costo_hora_pen: 0 }); }}
        onFocus={() => { if (q.length >= 2) setOpen(true); }}
      />
      {showOptions && optionsStyle && (
        <div className={`autocomplete-menu ${inlineOptions ? 'autocomplete-menu-inline' : 'autocomplete-menu-floating'}`} style={optionsStyle}>
          {resultados.length === 0 && <div className="autocomplete-empty">Sin resultados</div>}
          {resultados.map(p => {
            const chPEN = costoHoraPEN(p);
            const esUSD = monedaOT === 'USD' && tipoCambioHoy?.usd;
            const ch = esUSD ? Math.round(chPEN * tipoCambioHoy.usd * 100) / 100 : chPEN;
            return (
              <div key={p.id} onMouseDown={() => seleccionar(p)} className="autocomplete-option">
                <div className="autocomplete-option-title">{p.nombre}</div>
                <div className="autocomplete-option-meta">
                  {p.cargo || (esOp(p) ? 'Operativo' : 'Administrativo')}
                  {chPEN > 0 && <> · S/ {chPEN.toFixed(2)}/h{esUSD && ch > 0 ? ` ≈ US$ ${ch.toFixed(2)}/h` : ''}</>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Dashboard, CRM screens

function startKanbanDrag(e, id) {
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('is-dragging');

  const ghost = e.currentTarget.cloneNode(true);
  ghost.classList.add('kanban-drag-ghost');
  ghost.style.width = `${e.currentTarget.offsetWidth}px`;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 24, 24);
  window.setTimeout(() => ghost.remove(), 0);
}

function endKanbanDrag(e) {
  e.currentTarget.classList.remove('is-dragging');
}

const normalizeCurrencyCode = (moneda = 'PEN') => String(moneda || 'PEN').trim().toUpperCase();
const currencySymbol = (moneda = 'PEN') => {
  const code = normalizeCurrencyCode(moneda);
  if (code === 'USD') return 'US$';
  if (code === 'EUR') return '€';
  if (code === 'PEN') return 'S/';
  return code;
};
const moneyCurrency = (value, moneda = 'PEN') => money(value, currencySymbol(moneda));
const getCotizacionAprobadaOpp = (opp, cotizaciones = []) => {
  if (!opp?.id) return null;
  const aprobadas = (cotizaciones || []).filter(c =>
    c.oportunidad_id === opp.id &&
    ['aprobada', 'convertida'].includes(String(c.estado || '').toLowerCase())
  );
  if (!aprobadas.length) return null;
  return aprobadas.reduce((best, c) => {
    const cv = Number(c.version || 1);
    const bv = Number(best.version || 1);
    if (cv !== bv) return cv > bv ? c : best;
    return String(c.fecha || c.created_at || '') > String(best.fecha || best.created_at || '') ? c : best;
  }, aprobadas[0]);
};
const getOppMontoReal = (opp, cotizaciones = []) => {
  const cot = getCotizacionAprobadaOpp(opp, cotizaciones);
  const monto = cot
    ? Number(cot.subtotal ?? cot.subtotal_impl ?? cot.total_impl ?? cot.total ?? 0)
    : Number(opp?.monto_estimado || 0);
  return {
    monto: Number.isFinite(monto) ? monto : 0,
    moneda: normalizeCurrencyCode(cot?.moneda || opp?.moneda || 'PEN'),
    cotizacion: cot,
  };
};
const PROBABILIDAD_ETAPA_OPP_UI = {
  calificacion: 20,
  propuesta: 40,
  negociacion: 70,
  cierre: 70,
  ganada: 100,
  perdida: 0,
};
const getOppProbabilidadReal = (opp) => {
  const estado = String(opp?.estado || '').toLowerCase();
  const etapa = String(opp?.etapa || 'calificacion').toLowerCase();
  if (estado === 'ganada' || etapa === 'ganada') return 100;
  if (estado === 'perdida' || etapa === 'perdida') return 0;
  return PROBABILIDAD_ETAPA_OPP_UI[etapa] ?? 20;
};
const getOppForecastReal = (opp, cotizaciones = []) => {
  const real = getOppMontoReal(opp, cotizaciones);
  const prob = getOppProbabilidadReal(opp);
  return { monto: real.monto * prob / 100, moneda: real.moneda };
};
const getPersonalAsignableOT = (personalOperativo = [], personalAdmin = []) => {
  const estadosExcluidos = new Set(['inactivo', 'inactiva', 'baja', 'cesado', 'cesada', 'eliminado', 'eliminada']);
  const porId = new Map();
  [...(personalOperativo || []), ...(personalAdmin || [])].forEach(p => {
    if (!p?.id) return;
    const estado = String(p.estado || 'activo').toLowerCase();
    if (estadosExcluidos.has(estado)) return;
    if (!porId.has(p.id)) porId.set(p.id, p);
  });
  return Array.from(porId.values()).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
};

function Dashboard({ role }) {
  const { financiamientos, navigate, empresa, cxp } = useApp();
  const [cebeWarning, setCebeWarning] = useState(false);
  const canFin = role.permisos.ver_finanzas || role.permisos.todo;
  const isSuperadmin = role.permisos.plataforma;

  const todayDash = new Date().toISOString().split('T')[0];
  const cxpVencidas = (cxp || []).filter(c => {
    if (!c.fecha_vencimiento || Number(c.saldo ?? c.monto_total ?? 0) <= 0 || c.estado === 'pagada') return false;
    return c.fecha_vencimiento < todayDash;
  });
  const cxpPorVencer7 = (cxp || []).filter(c => {
    if (!c.fecha_vencimiento || Number(c.saldo ?? c.monto_total ?? 0) <= 0 || c.estado === 'pagada') return false;
    const dias = Math.floor((new Date(`${c.fecha_vencimiento}T00:00:00`) - new Date(`${todayDash}T00:00:00`)) / 86400000);
    return dias >= 0 && dias <= 7;
  });
  const montoCxpVencido = cxpVencidas.reduce((s, c) => s + Number(c.saldo ?? c.monto_total ?? 0), 0);

  useEffect(() => {
    let mounted = true;
    if (!empresa?.id) return;
    maestrosService.getCentrosBeneficio(empresa.id)
      .then(rows => {
        if (mounted) setCebeWarning(!(rows || []).some(r => r.estado === 'activo'));
      })
      .catch(() => {
        if (mounted) setCebeWarning(false);
      });
    return () => { mounted = false; };
  }, [empresa?.id]);

  const kpis = [
    { label: 'Leads este mes', val: '24', delta: '+12%', up: true, icon: I.target, color: 'cyan' },
    { label: 'Oportunidades activas', val: money(185000), delta: '+8%', up: true, icon: I.pipe, color: 'purple' },
    { label: 'Ventas del mes', val: money(342000), delta: '+15%', up: true, icon: I.dollar, color: 'green', fin: true },
    { label: 'OTs activas', val: '12', sub: '3 en riesgo SLA', icon: I.wrench, color: 'orange' },
    { label: 'Facturación del mes', val: money(298000), delta: '+6%', up: true, icon: I.receipt, color: 'cyan', fin: true },
    { label: 'Pendiente por cobrar', val: money(172900), sub: 'S/ 51.3K vencido', icon: I.dollar, color: 'danger', fin: true },
    { label: 'CxP vencidas', val: money(montoCxpVencido), sub: `${cxpVencidas.length} documento${cxpVencidas.length !== 1 ? 's' : ''}`, icon: I.clock, color: 'danger', fin: true },
    { label: 'CxP por vencer (7d)', val: String(cxpPorVencer7.length), sub: cxpPorVencer7.length > 0 ? 'Requieren atención' : 'Al día', icon: I.bell, color: cxpPorVencer7.length > 0 ? 'orange' : 'green', fin: true },
  ].filter(k => !k.fin || canFin);

  const healthDist = {
    verde:    MOCK.healthScoresDetalle.filter(h => h.semaforo === 'verde').length,
    amarillo: MOCK.healthScoresDetalle.filter(h => h.semaforo === 'amarillo').length,
    rojo:     MOCK.healthScoresDetalle.filter(h => h.semaforo === 'rojo').length,
  };
  const atRisk = MOCK.healthScoresDetalle
    .filter(h => h.score_total < 50)
    .map(h => ({ ...h, nombre: MOCK.cuentas.find(c => c.id === h.cuenta_id)?.razon_social || h.cuenta_id }));
  const cuentaNombre = id => MOCK.cuentas.find(c => c.id === id)?.razon_social || id;
  const upcomingRenovaciones = [...(MOCK.renovaciones || [])]
    .sort((a, b) => a.dias_restantes - b.dias_restantes)
    .slice(0, 3);
  const deudaPorVencer = (financiamientos || []).filter(f => {
    const cuota = (f.tabla_amortizacion || []).find(c => c.estado === 'pendiente');
    if (!cuota || f.estado !== 'vigente') return false;
    const dias = Math.ceil((new Date(cuota.fecha + 'T00:00:00') - new Date('2026-04-28T00:00:00')) / 86400000);
    return dias >= 0 && dias <= 7;
  });

  return (
    <>
      {cebeWarning && (
        <div className="alert alert-danger" style={{marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
          <span>No existe ningún CEBE activo. Crea al menos uno en Maestros Base para poder operar correctamente.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('maestros')}>Ir a Maestros Base</button>
        </div>
      )}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard General</h1>
          <div className="page-sub">Vista consolidada — {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtrar período</button>
          <button className="btn btn-secondary">{I.download} Exportar</button>
        </div>
      </div>

      {isSuperadmin && (
        <div className="card" style={{padding:16, marginBottom:20, background:'linear-gradient(135deg, rgba(0,188,212,0.08), transparent)', borderColor:'rgba(0,188,212,0.3)'}}>
          <div className="row" style={{gap:12}}>
            <div className="kpi-icon cyan" style={{position:'static'}}>{I.shield}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700, fontFamily:'Sora'}}>Vista Superadmin TIDEO</div>
              <div className="text-muted" style={{fontSize:12}}>Acceso a panel de plataforma multitenant. Gestionando 2 empresas activas.</div>
            </div>
            <span className="badge badge-cyan"><span className="dot" style={{background:'currentColor'}}/>2 tenants</span>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <div key={i} className="kpi-card hover-raise">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.val}</div>
            {k.delta && <div className={'kpi-delta ' + (k.up ? 'up' : 'down')}>{k.up ? I.arrowUp : I.arrowDown}{k.delta} vs mes anterior</div>}
            {k.sub && <div className="kpi-delta" style={{color: k.color === 'danger' ? 'var(--danger)' : 'var(--fg-muted)'}}>{k.sub}</div>}
            <div className={'kpi-icon ' + k.color}>{k.icon}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Ventas vs Costos — Últimos 6 meses</h3>
            <span className="badge badge-cyan">Margen prom. 37%</span>
          </div>
          <div className="card-body">
            <BarsChart/>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>OTs por estado</h3></div>
          <div className="card-body">
            <DonutChart/>
            <div className="col mt-4" style={{gap:6}}>
              {[
                {l:'Programadas', v:4, c:'var(--cyan)'},
                {l:'En ejecución', v:5, c:'var(--orange)'},
                {l:'Cerradas técnicas', v:2, c:'var(--purple)'},
                {l:'Facturadas', v:3, c:'var(--green)'},
              ].map((x,i) => (
                <div key={i} className="row" style={{justifyContent:'space-between', fontSize:12}}>
                  <span className="row" style={{gap:6}}><span style={{width:8,height:8,borderRadius:999,background:x.c}}/>{x.l}</span>
                  <strong>{x.v}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2 mt-6">
        {deudaPorVencer.length > 0 && (
          <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
            <div className="card-head"><h3>Cuotas por vencer</h3><button className="btn btn-secondary btn-sm" onClick={() => navigate('financiamiento')}>Ver deuda</button></div>
            <div className="card-body">
              {deudaPorVencer.map(f => {
                const cuota = (f.tabla_amortizacion || []).find(c => c.estado === 'pendiente');
                const dias = Math.ceil((new Date(cuota.fecha + 'T00:00:00') - new Date('2026-04-28T00:00:00')) / 86400000);
                return (
                  <div key={f.id} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:'13px' }}>
                    <span>{f.entidad}</span>
                    <span style={{ fontWeight:600 }}>{moneyD(cuota.total)}</span>
                    <span style={{ color:'var(--orange)' }}>Vence en {dias} días</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-head">
            <h3>Alertas operativas</h3>
            <span className="text-muted" style={{fontSize:12}}>Prioridad alta</span>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>OT</th><th>Cliente</th><th>SLA</th><th>Responsable</th></tr></thead>
              <tbody>
                {MOCK.ots.filter(o => o.estado === 'ejecucion' || o.sla === 'vencido').slice(0,4).map(o => (
                  <tr key={o.id}>
                    <td className="mono">{o.id}</td>
                    <td>{o.cliente}</td>
                    <td><span className={'badge ' + (o.sla==='vencido'?'badge-red':o.sla==='riesgo'?'badge-orange':'badge-green')}>{o.sla==='vencido'?'Vencido':o.sla==='riesgo'?'En riesgo':'En plazo'}</span></td>
                    <td className="text-muted">{o.responsable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Pendientes desde campo</h3>
            <span className="badge badge-cyan">2 por revisar</span>
          </div>
          <div className="card-body col" style={{gap:10}}>
            {MOCK.compras.filter(c => c.campo).map(c => (
              <div key={c.id} className="row" style={{gap:12, padding:10, border:'1px solid var(--border)', borderRadius:8}}>
                <div className="kpi-icon cyan" style={{position:'static',width:34,height:34}}>{I.camera}</div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:13}}>Compra {c.id} · {c.proveedor}</div>
                  <div className="text-muted" style={{fontSize:12}}>{c.ot} · {money(c.monto)}</div>
                </div>
                <span className="badge badge-cyan">Desde campo</span>
              </div>
            ))}
            <div style={{padding:10, border:'1px dashed var(--border)', borderRadius:8, fontSize:12, color:'var(--fg-muted)', textAlign:'center'}}>
              3 partes diarios pendientes de aprobación del supervisor
            </div>
          </div>
        </div>
      </div>

      {/* ── F3: Customer Success Overview ────────────────────────── */}
      <div className="grid-2 mt-6">
        <div className="card">
          <div className="card-head">
            <h3>Customer Health Portfolio</h3>
            <span className="badge badge-purple" style={{fontSize:10}}>F3 · Customer Success</span>
          </div>
          <div className="card-body">
            <div className="row" style={{gap:8, marginBottom:16, justifyContent:'space-around'}}>
              {[
                { label:'Saludable', count: healthDist.verde,    color:'var(--green)',   cls:'health-green' },
                { label:'Observación',count: healthDist.amarillo, color:'var(--warning)', cls:'health-orange' },
                { label:'Crítico',   count: healthDist.rojo,     color:'var(--danger)',  cls:'health-red' },
              ].map((s, i) => (
                <div key={i} style={{textAlign:'center'}}>
                  <div style={{fontSize:34, fontWeight:800, color:s.color, lineHeight:1}}>{s.count}</div>
                  <div style={{fontSize:11, color:'var(--fg-subtle)', marginTop:4}}>{s.label}</div>
                </div>
              ))}
            </div>
            {atRisk.length > 0 && (
              <div className="col" style={{gap:8}}>
                <div style={{fontSize:11, color:'var(--fg-subtle)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2}}>Clientes en riesgo</div>
                {atRisk.map((h, i) => (
                  <div key={i} className="row" style={{gap:10, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8}}>
                    <span className={'health-dot health-' + (h.score_total < 40 ? 'red' : 'orange')}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:600}}>{h.nombre}</div>
                      <div className="text-muted" style={{fontSize:11}}>Score {h.score_total} · {h.tendencia}</div>
                    </div>
                    <span className={'badge ' + (h.score_total < 40 ? 'badge-red' : 'badge-yellow')}>{h.semaforo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Renovaciones próximas</h3>
            <span className="badge badge-cyan" style={{fontSize:10}}>{upcomingRenovaciones.length} pendientes</span>
          </div>
          <div className="card-body col" style={{gap:10}}>
            {upcomingRenovaciones.map((r, i) => (
              <div key={i} className="row" style={{gap:12, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:13}}>{cuentaNombre(r.cuenta_id)}</div>
                  <div className="text-muted" style={{fontSize:11}}>{r.servicio} · {money(r.monto_contrato)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <span className={'badge ' + (r.dias_restantes <= 30 ? 'badge-red' : r.dias_restantes <= 60 ? 'badge-yellow' : 'badge-green')}>
                    {r.dias_restantes}d
                  </span>
                  <div style={{fontSize:10, color:'var(--fg-muted)', marginTop:2}}>{r.fecha_vencimiento}</div>
                </div>
              </div>
            ))}
            {upcomingRenovaciones.length === 0 && (
              <div className="text-muted" style={{textAlign:'center', padding:16, fontSize:13}}>Sin renovaciones próximas.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Simple bar/donut charts
function BarsChart() {
  const data = [
    { m:'Nov', v:280, c:180 }, { m:'Dic', v:320, c:200 },
    { m:'Ene', v:260, c:175 }, { m:'Feb', v:310, c:195 },
    { m:'Mar', v:355, c:220 }, { m:'Abr', v:342, c:216 },
  ];
  const max = 400;
  return (
    <svg viewBox="0 0 600 240" width="100%" height="240">
      {[0, 100, 200, 300, 400].map((y, i) => (
        <g key={i}>
          <line x1="40" y1={220 - y/max*200} x2="590" y2={220 - y/max*200} stroke="var(--border-subtle)"/>
          <text x="32" y={224 - y/max*200} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">{y}K</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = 70 + i * 90;
        return (
          <g key={i}>
            <rect x={x} y={220 - d.v/max*200} width="28" height={d.v/max*200} fill="var(--cyan)" rx="2"/>
            <rect x={x+32} y={220 - d.c/max*200} width="28" height={d.c/max*200} fill="var(--navy)" opacity="0.6" rx="2"/>
            <text x={x+30} y="234" textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{d.m}</text>
          </g>
        );
      })}
      <g transform="translate(420, 10)">
        <rect x="0" y="0" width="10" height="10" fill="var(--cyan)" rx="2"/>
        <text x="16" y="9" fontSize="11" fill="var(--fg)">Ventas</text>
        <rect x="70" y="0" width="10" height="10" fill="var(--navy)" opacity="0.6" rx="2"/>
        <text x="86" y="9" fontSize="11" fill="var(--fg)">Costos</text>
      </g>
    </svg>
  );
}

function DonutChart() {
  const segs = [
    { v: 4, c: 'var(--cyan)' },
    { v: 5, c: 'var(--orange)' },
    { v: 2, c: 'var(--purple)' },
    { v: 3, c: 'var(--green)' },
  ];
  const total = segs.reduce((s, x) => s + x.v, 0);
  let offset = 0;
  const R = 60, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 180 180" width="100%" height="180">
      <g transform="translate(90 90) rotate(-90)">
        {segs.map((s, i) => {
          const len = (s.v / total) * C;
          const el = <circle key={i} r={R} cx="0" cy="0" fill="none" stroke={s.c} strokeWidth="22" strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-offset}/>;
          offset += len;
          return el;
        })}
      </g>
      <text x="90" y="85" textAnchor="middle" fontFamily="Sora" fontWeight="700" fontSize="28" fill="var(--fg)">{total}</text>
      <text x="90" y="105" textAnchor="middle" fontSize="11" fill="var(--fg-muted)">OTs activas</text>
    </svg>
  );
}

// ============ LEADS KANBAN ============
function Leads() {
  const { leads, setLeads, crearLead, actualizarLeadDatos, eliminarLead, updateLeadState, convertirLead, descartarLead, reactivarLead, navigate, usuarios, empresa, monedasActivas, searchQuery, campanas, roles, industrias, actividades, historialEstados, oportunidades, cotizaciones, addNotificacion, authUser } = useApp();
  const [view, setView] = useState('kanban');
  const [showFiltrosLeads, setShowFiltrosLeads] = useState(false);
  const [filterLeadFuente, setFilterLeadFuente] = useState('');
  const [filterLeadResponsable, setFilterLeadResponsable] = useState('');
  const [filterLeadEtapa, setFilterLeadEtapa] = useState('');
  const [filterLeadScoring, setFilterLeadScoring] = useState('');
  const [filterLeadDesde, setFilterLeadDesde] = useState('');
  const [filterLeadHasta, setFilterLeadHasta] = useState('');

  const query = searchQuery.toLowerCase();
  const _leadsBase = leads
    .filter(l => canUserSeeOwner({ viewer: authUser, ownerUserId: l.responsable_id, ownerName: l.responsable, users: usuarios, roles }))
    .filter(l =>
      l.nombre.toLowerCase().includes(query) ||
      l.empresa_contacto.toLowerCase().includes(query) ||
      (l.necesidad || '').toLowerCase().includes(query)
    )
    .filter(l => !filterLeadFuente || l.fuente === filterLeadFuente)
    .filter(l => !filterLeadResponsable || l.responsable_id === filterLeadResponsable)
    .filter(l => !filterLeadEtapa || l.estado === filterLeadEtapa)
    .filter(l => !filterLeadDesde || (l.fecha_creacion || '') >= filterLeadDesde)
    .filter(l => !filterLeadHasta || (l.fecha_creacion || '') <= filterLeadHasta);
  const [sel, setSel] = useState(null);
  const [modalConvertir, setModalConvertir] = useState(null);
  const [convForm, setConvForm] = useState(null);
  const [modalConvertirDrag, setModalConvertirDrag] = useState(null);
  const [modalMoverLead, setModalMoverLead] = useState(null);
  const [moverMotivo, setMoverMotivo] = useState('');
  const [moverError, setMoverError] = useState('');
  const abrirMoverModal = (lead, destino) => { setMoverMotivo(''); setMoverError(''); setModalMoverLead({ lead, destino }); };
  const [modalEliminarLead, setModalEliminarLead] = useState(null);
  const [modalReactivar, setModalReactivar] = useState(null);
  const [kanbanToast, setKanbanToast] = useState(null);
  const [fichaTab, setFichaTab] = useState('detalles');
  const [tlFiltroTipo, setTlFiltroTipo] = useState('todos');
  const [tlFiltroDesde, setTlFiltroDesde] = useState('');
  const [tlFiltroHasta, setTlFiltroHasta] = useState('');
  useEffect(() => { setFichaTab('detalles'); setTlFiltroTipo('todos'); setTlFiltroDesde(''); setTlFiltroHasta(''); }, [sel?.id]);
  const showKanbanToast = (msg) => {
    setKanbanToast(msg);
    setTimeout(() => setKanbanToast(null), 3500);
  };
  const opcionesIndustria = industrias?.length ? industrias.map(i => i.nombre || i) : ['Mineria','Industrial','Construccion','Agroindustria','Facilities','Energia','Petroleo & Gas','Logistica','Retail','Salud','Educacion','Tecnologia','Servicios profesionales','Sector publico','Otro'];
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [editandoLead, setEditandoLead] = useState(null);
  const formNuevoBase = { nombre:'', cargo:'', empresa_contacto:'', razon_social:'', ruc:'', industria:'', telefono:'', email:'', fuente:'', campana_id:'', registrado_desde:'web', responsable:'', responsable_id:'', urgencia:'media', necesidad:'', presupuesto_estimado:'', moneda: empresa?.moneda || 'PEN', servicio_interes:'' };
  const [formNuevo, setFormNuevo] = useState(formNuevoBase);
  const [errores, setErrores] = useState({});
  const comercialesAsignables = getAssignableUsers({ users: usuarios, roles, categories: ['comercial'], includeAdmins: true, empresaId: empresa?.id, viewer: authUser });
  const [campanasForm, setCampanasForm] = useState([]);
  const [loadingCampanasForm, setLoadingCampanasForm] = useState(false);
  const [serviciosCatalogo, setServiciosCatalogo] = useState([]);
  const [loadingServiciosCatalogo, setLoadingServiciosCatalogo] = useState(false);

  const getLeadOportunidad = lead => (oportunidades || []).find(o => o.lead_id === lead.id || o.lead_origen === lead.id);
  const getLatestCotizacion = oppId => {
    const oppCots = (cotizaciones || []).filter(c => c.oportunidad_id === oppId);
    if (!oppCots.length) return null;
    return oppCots.reduce((best, c) => {
      const cv = Number(c.version || 1);
      const bv = Number(best.version || 1);
      if (cv !== bv) return cv > bv ? c : best;
      return String(c.fecha || c.created_at || '') > String(best.fecha || best.created_at || '') ? c : best;
    }, oppCots[0]);
  };
  const getLeadPotencial = lead => {
    const opp = getLeadOportunidad(lead);
    const cot = opp ? getLatestCotizacion(opp.id) : null;
    const montoCot = Number(cot?.subtotal ?? cot?.subtotal_impl ?? 0);
    if (cot) return { monto: Number.isFinite(montoCot) ? montoCot : 0, moneda: cot.moneda || opp?.moneda || lead.moneda || 'PEN', fuente: 'cotizacion' };
    if (opp && Number(opp.monto_estimado || 0) > 0) return { monto: Number(opp.monto_estimado || 0), moneda: opp.moneda || lead.moneda || 'PEN', fuente: 'oportunidad' };
    return { monto: Number(lead.presupuesto_estimado || 0), moneda: lead.moneda || 'PEN', fuente: 'lead' };
  };
  const getLeadEditState = lead => {
    const opp = lead ? getLeadOportunidad(lead) : null;
    const cot = opp ? getLatestCotizacion(opp.id) : null;
    return {
      montoBloqueado: Boolean(cot),
      potencial: lead ? getLeadPotencial(lead) : null,
    };
  };
  const potencialPorMoneda = list => {
    const acc = {};
    list.forEach(l => {
      const p = getLeadPotencial(l);
      const moneda = normalizeCurrencyCode(p.moneda);
      acc[moneda] = (acc[moneda] || 0) + p.monto;
    });
    return Object.entries(acc).sort(([a], [b]) => (a === 'PEN' ? -1 : b === 'PEN' ? 1 : a.localeCompare(b)));
  };
  const formatPotencialPorMoneda = list => {
    const lines = potencialPorMoneda(list);
    return lines.length ? lines.map(([moneda, monto]) => moneyCurrency(monto, moneda)).join(' · ') : moneyCurrency(0, empresa?.moneda || 'PEN');
  };

  useEffect(() => {
    if (!modalConvertir) return;
    const potencial = getLeadPotencial(modalConvertir);
    setConvForm({
      nombre_comercial: modalConvertir.empresa_contacto || '',
      razon_social: modalConvertir.razon_social || modalConvertir.empresa_contacto || '',
      ruc: modalConvertir.ruc || '',
      industria: modalConvertir.industria || '',
      fuente: modalConvertir.fuente || '',
      contacto_nombre: modalConvertir.nombre || '',
      contacto_cargo: modalConvertir.cargo || '',
      contacto_telefono: modalConvertir.telefono || '',
      contacto_email: modalConvertir.email || '',
      nombre_oportunidad: `${modalConvertir.necesidad?.slice(0,50) || 'Venta'} — ${modalConvertir.empresa_contacto}`,
      monto_estimado: potencial.monto || '',
      moneda: potencial.moneda || 'PEN',
      etapa_inicial: 'calificacion'
    });
  }, [modalConvertir, oportunidades, cotizaciones]);

  useEffect(() => {
    if (!panelNuevo) return;
    if (isSupabaseConfigured() && empresa?.id) {
      setLoadingCampanasForm(true);
      campanasService.listar(empresa.id)
        .then(data => setCampanasForm((data || []).filter(c => c.estado === 'activa')))
        .catch(() => setCampanasForm((campanas || []).filter(c => c.estado === 'activa')))
        .finally(() => setLoadingCampanasForm(false));
    } else {
      setCampanasForm((campanas || []).filter(c => c.estado === 'activa'));
    }
  }, [panelNuevo]);

  useEffect(() => {
    if (!panelNuevo) return;
    if (isSupabaseConfigured() && empresa?.id) {
      setLoadingServiciosCatalogo(true);
      maestrosService.getServicios(empresa.id)
        .then(data => setServiciosCatalogo((data || []).filter(s => s.estado === 'activo')))
        .catch(() => setServiciosCatalogo((MOCK.servicios || []).filter(s => s.estado === 'activo')))
        .finally(() => setLoadingServiciosCatalogo(false));
    } else {
      setServiciosCatalogo((MOCK.servicios || []).filter(s => s.estado === 'activo'));
    }
  }, [panelNuevo, empresa?.id]);

  const updateNuevo = (f, v) => setFormNuevo(p => ({ ...p, [f]: v }));
  const updateResponsableNuevo = (userId) => {
    const user = comercialesAsignables.find(u => u.id === userId);
    setFormNuevo(p => ({
      ...p,
      responsable_id: user?.id || '',
      responsable: user?.nombre || '',
    }));
  };
  const cerrarPanelLead = () => {
    setPanelNuevo(false);
    setEditandoLead(null);
    setFormNuevo(formNuevoBase);
    setErrores({});
  };
  const abrirEditarLead = (lead) => {
    const responsable = lead.responsable_id
      ? comercialesAsignables.find(u => u.id === lead.responsable_id)
      : comercialesAsignables.find(u => String(u.nombre || '').trim() === String(lead.responsable || '').trim());
    const potencial = getLeadPotencial(lead);
    setFormNuevo({
      ...formNuevoBase,
      nombre: lead.nombre || lead.nombre_contacto || '',
      cargo: lead.cargo || '',
      empresa_contacto: lead.empresa_contacto || lead.empresa_nombre || '',
      razon_social: lead.razon_social || '',
      ruc: lead.ruc || '',
      industria: lead.industria || '',
      telefono: sanitizePhone(lead.telefono || ''),
      email: lead.email || '',
      fuente: lead.fuente || '',
      campana_id: lead.campana_id || '',
      registrado_desde: lead.registrado_desde || 'web',
      responsable: responsable?.nombre || lead.responsable || '',
      responsable_id: responsable?.id || lead.responsable_id || '',
      urgencia: lead.urgencia || 'media',
      necesidad: lead.necesidad || '',
      presupuesto_estimado: potencial.monto ?? '',
      moneda: potencial.moneda || lead.moneda || 'PEN',
      servicio_interes: lead.servicio_interes || '',
    });
    setEditandoLead(lead);
    setSel(null);
    setPanelNuevo(true);
  };
  const confirmarEliminarLead = async (lead) => {
    if (!lead?.id) return;
    if (!window.confirm(`Eliminar el lead "${lead.nombre || lead.nombre_contacto}"?`)) return;
    try {
      await eliminarLead(lead.id);
      if (sel?.id === lead.id) setSel(null);
      if (editandoLead?.id === lead.id) cerrarPanelLead();
    } catch (_) { /* notificacion emitida en context */ }
  };

  const guardarLead = (e) => {
    e.preventDefault();
    const errs = {};
    const esLeadConvertidoActual = Boolean(editandoLead && (editandoLead.convertido || editandoLead.estado === 'convertido'));
    if (!esLeadConvertidoActual && !formNuevo.nombre) errs.nombre = true;
    if (!esLeadConvertidoActual && !formNuevo.empresa_contacto) errs.empresa_contacto = true;
    if (!esLeadConvertidoActual && !formNuevo.responsable_id) errs.responsable = true;
    if (formNuevo.telefono && !isValidPhone(formNuevo.telefono)) errs.telefono = 'El teléfono debe tener 9 dígitos y comenzar con 9';
    if (formNuevo.ruc && !isValidRuc(formNuevo.ruc)) errs.ruc = 'El RUC debe tener 11 números y comenzar con 1 o 2';
    if (Object.keys(errs).length) { setErrores(errs); return; }
    const editStateActual = editandoLead ? getLeadEditState(editandoLead) : { montoBloqueado: false };
    const datos = esLeadConvertidoActual ? {
      urgencia: formNuevo.urgencia,
    } : {
      nombre: formNuevo.nombre,
      cargo: formNuevo.cargo,
      empresa_contacto: formNuevo.empresa_contacto,
      razon_social: formNuevo.razon_social || formNuevo.empresa_contacto,
      ruc: formNuevo.ruc || null,
      industria: formNuevo.industria || null,
      telefono: formNuevo.telefono,
      email: formNuevo.email,
      fuente: formNuevo.fuente || 'Manual',
      campana_id: formNuevo.campana_id || null,
      campana: campanas.find(c => c.id === formNuevo.campana_id)?.nombre || null,
      registrado_desde: formNuevo.registrado_desde,
      responsable: formNuevo.responsable,
      responsable_id: formNuevo.responsable_id,
      urgencia: formNuevo.urgencia,
      necesidad: formNuevo.necesidad,
      servicio_interes: formNuevo.servicio_interes || null,
    };
    if (!esLeadConvertidoActual && !editStateActual.montoBloqueado) {
      datos.presupuesto_estimado = Number(formNuevo.presupuesto_estimado) || 0;
      datos.moneda = formNuevo.moneda;
    }
    if (editandoLead) {
      actualizarLeadDatos(editandoLead.id, datos);
    } else {
      crearLead({
        id: `lead_${Date.now().toString(36)}`,
        empresa_id: empresa?.id || 'emp_001',
        ...datos,
        estado: 'nuevo',
        fecha_creacion: new Date().toISOString().split('T')[0],
        dias_sin_actividad: 0,
        convertido: false
      });
    }
    cerrarPanelLead();
  };

  const cols = [
    { k: 'nuevo', title: 'Nuevo', color: '#64748b', hint: 'Lead recién registrado. Aún no has tenido contacto.' },
    { k: 'en_contacto', title: 'En contacto', color: '#06b6d4', hint: 'Ya le escribiste o llamaste. Hay conversación iniciada.' },
    { k: 'calificado', title: 'Calificado', color: '#8b5cf6', hint: 'Confirmaste necesidad, presupuesto y decisión.' },
    { k: 'convertido', title: 'Convertido', color: '#10b981', hint: 'Muévelo aquí para crear cuenta, contacto y oportunidad automáticamente.' },
    { k: 'descartado', title: 'Descartado', color: '#f97316', hint: 'No califica o perdió interés. Registra el motivo.' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    if (lead.estado === 'descartado') {
      showKanbanToast('Este lead está descartado. Ábrelo y usa "Reactivar lead" para volver a trabajarlo.');
      return;
    }
    if (lead.convertido && targetStatus !== 'convertido') {
      showKanbanToast('Este lead ya fue convertido en oportunidad y no puede moverse. Si la oportunidad se descarta, hazlo desde el módulo de Pipeline.');
      return;
    }
    if (targetStatus === 'nuevo' && lead.estado !== 'nuevo') {
      showKanbanToast('Ese lead no puede volver a Nuevo y por tanto eliminarse. Si ya no es válido, pásalo a Descartado y describe el motivo.');
      return;
    }
    if (targetStatus === 'convertido') {
      if (!lead.convertido) { setModalConvertirDrag(lead); return; }
      return;
    }
    if (lead.estado === targetStatus) return;
    if (targetStatus === 'calificado' && !(getLeadPotencial(lead).monto > 0)) {
      showKanbanToast('Para calificar este lead debes registrar un presupuesto estimado.');
      return;
    }
    abrirMoverModal(lead, targetStatus);
  };

  const getFuenteIcon = (f) => {
    if(!f) return null;
    const fl = f.toLowerCase();
    if(fl.includes('web')) return <span style={{color:'var(--blue)'}}>🌐</span>;
    if(fl.includes('linkedin')) return <span style={{color:'var(--navy)'}}>💼</span>;
    if(fl.includes('evento') || fl.includes('feria')) return <span style={{color:'var(--purple)'}}>📅</span>;
    return <span style={{color:'var(--cyan)'}}>🔗</span>;
  };

  const calcularScoreLead = (lead) => {
    let score = 0;
    const fuente = (lead.fuente || '').toLowerCase();
    const fuentePremium = ['referido','evento','feria'].some(k => fuente.includes(k));
    const fuenteMedia = !fuentePremium && ['linkedin','diagnóstico','diagnostico','formulario'].some(k => fuente.includes(k));
    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tieneActividadReciente = (actividades || []).some(a =>
      a.lead_id === lead.id && new Date(a.fecha || a.created_at) >= hace7dias
    );

    const tieneRuc           = !!(lead.ruc && String(lead.ruc).trim());
    const tienePresupuesto   = (getLeadPotencial(lead).monto || 0) > 0;
    const tieneNecesidad     = !!(lead.necesidad && String(lead.necesidad).trim());
    const tieneResponsable   = !!(lead.responsable_id || lead.responsable);
    const fueReactivado      = (lead.veces_reactivado || 0) > 0;
    const muySinActividad    = Number(lead.dias_sin_actividad || 0) > 15;
    const fueDescartado      = lead.estado === 'descartado';

    if (tieneRuc)               score += 10;
    if (tienePresupuesto)        score += 15;
    if (fuentePremium)           score += 15;
    else if (fuenteMedia)        score += 10;
    if (tieneNecesidad)          score += 10;
    if (tieneResponsable)        score += 10;
    if (tieneActividadReciente)  score += 20;
    if (fueReactivado)           score += 5;
    if (muySinActividad)         score -= 15;
    if (fueDescartado)           score -= 10;

    score = Math.max(0, Math.min(100, score));

    const label = score <= 30 ? 'Lead frío' : score <= 60 ? 'Lead tibio' : 'Lead caliente';
    const color = score <= 30 ? 'var(--danger)' : score <= 60 ? 'var(--orange)' : 'var(--green)';
    const bgLight = score <= 30 ? 'rgba(239,68,68,0.07)' : score <= 60 ? 'rgba(249,115,22,0.07)' : 'rgba(16,185,129,0.07)';

    const criterios = [
      { text: `RUC registrado (+10)`,                    estado: tieneRuc ? 'suma' : 'neutro' },
      { text: `Presupuesto declarado (+15)`,              estado: tienePresupuesto ? 'suma' : 'neutro' },
      { text: `Fuente premium: Referido/Evento (+15)`,    estado: fuentePremium ? 'suma' : 'neutro' },
      { text: `Fuente digital: LinkedIn/Formulario (+10)`,estado: fuenteMedia ? 'suma' : 'neutro' },
      { text: `Necesidad declarada (+10)`,                estado: tieneNecesidad ? 'suma' : 'neutro' },
      { text: `Responsable asignado (+10)`,               estado: tieneResponsable ? 'suma' : 'neutro' },
      { text: `Actividad en últimos 7 días (+20)`,        estado: tieneActividadReciente ? 'suma' : 'neutro' },
      { text: `Lead reactivado antes (+5)`,               estado: fueReactivado ? 'suma' : 'neutro' },
      { text: `Más de 15 días sin actividad (-15)`,       estado: muySinActividad ? 'resta' : 'neutro' },
      { text: `Historial de descarte (-10)`,              estado: fueDescartado ? 'resta' : 'neutro' },
    ];

    return { score, label, color, bgLight, criterios };
  };

  const filteredLeads = !filterLeadScoring ? _leadsBase : _leadsBase.filter(l => {
    const sc = calcularScoreLead(l).score;
    if (filterLeadScoring === 'alto') return sc >= 70;
    if (filterLeadScoring === 'medio') return sc >= 40 && sc < 70;
    return sc < 40;
  });

  const leadsActivos = leads.filter(l => !['convertido','descartado'].includes(l.estado));
  const potencialTotal = formatPotencialPorMoneda(leadsActivos);
  const editState = editandoLead ? getLeadEditState(editandoLead) : { montoBloqueado: false, potencial: null };
  const editandoLeadConvertido = Boolean(editandoLead && (editandoLead.convertido || editandoLead.estado === 'convertido'));
  const campoBloqueadoConvertido = editandoLeadConvertido;
  const montoBloqueado = editState.montoBloqueado || editandoLeadConvertido;
  const motivoBloqueoMonto = editState.montoBloqueado ? 'Cotizacion vinculada' : editandoLeadConvertido ? 'Oportunidad vinculada' : '';
  const estiloBloqueado = bloqueado => bloqueado ? { background:'var(--bg-subtle)', color:'var(--fg-muted)', cursor:'not-allowed' } : undefined;
  const LockHint = ({ children }) => (
    <span className="lead-lock-hint">{children}</span>
  );
  
  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Leads</h1>
          <div className="page-sub" style={{marginTop:4, display:'flex', alignItems:'center', gap:10}}>
            <span>{leadsActivos.length} lead{leadsActivos.length !== 1 ? 's' : ''} activo{leadsActivos.length !== 1 ? 's' : ''}</span>
            <span style={{width:4, height:4, borderRadius:99, background:'var(--border)'}}/>
            <span>Potencial total <strong>{potencialTotal}</strong></span>
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className={`btn ${showFiltrosLeads ? 'btn-primary' : 'btn-secondary'}`} style={{padding:'8px 16px', borderRadius:8}} onClick={() => setShowFiltrosLeads(f => !f)}>{I.filter} Filtros{(filterLeadFuente||filterLeadResponsable||filterLeadEtapa||filterLeadScoring||filterLeadDesde||filterLeadHasta) ? ' •' : ''}</button>
          <button className="btn btn-primary" data-local-form="true" style={{padding:'8px 20px', borderRadius:8}} onClick={() => setPanelNuevo(true)}>{I.plus} Nuevo lead</button>
        </div>
      </div>

      {showFiltrosLeads && (
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
            <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterLeadFuente} onChange={e => setFilterLeadFuente(e.target.value)}>
              <option value="">Todas las fuentes</option>
              {['Referido','Formulario web','LinkedIn','Evento / Feria','Cold outreach','Manual'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterLeadResponsable} onChange={e => setFilterLeadResponsable(e.target.value)}>
              <option value="">Todos los responsables</option>
              {comercialesAsignables.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterLeadEtapa} onChange={e => setFilterLeadEtapa(e.target.value)}>
              <option value="">Todas las etapas</option>
              <option value="nuevo">Nuevo</option>
              <option value="en_contacto">En contacto</option>
              <option value="calificado">Calificado</option>
              <option value="convertido">Convertido</option>
              <option value="descartado">Descartado</option>
            </select>
            <select className="select" style={{flex:'1 1 140px', minWidth:120}} value={filterLeadScoring} onChange={e => setFilterLeadScoring(e.target.value)}>
              <option value="">Cualquier scoring</option>
              <option value="alto">Alto (&ge;70)</option>
              <option value="medio">Medio (40–69)</option>
              <option value="bajo">Bajo (&lt;40)</option>
            </select>
            <input type="date" className="input" style={{flex:'1 1 140px', minWidth:120}} value={filterLeadDesde} onChange={e => setFilterLeadDesde(e.target.value)} title="Registrado desde"/>
            <input type="date" className="input" style={{flex:'1 1 140px', minWidth:120}} value={filterLeadHasta} onChange={e => setFilterLeadHasta(e.target.value)} title="Registrado hasta"/>
            {(filterLeadFuente||filterLeadResponsable||filterLeadEtapa||filterLeadScoring||filterLeadDesde||filterLeadHasta) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterLeadFuente(''); setFilterLeadResponsable(''); setFilterLeadEtapa(''); setFilterLeadScoring(''); setFilterLeadDesde(''); setFilterLeadHasta(''); }}>{I.x} Limpiar</button>
            )}
          </div>
        </div>
      )}

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(5, 1fr)'}}>
        {cols.map((c, i) => {
          const list = filteredLeads.filter(l => l.estado === c.k);
          const sumPEN = list.reduce((s,l) => { const p = getLeadPotencial(l); return normalizeCurrencyCode(p.moneda) === 'PEN' ? s + p.monto : s; }, 0);
          const sumUSD = list.reduce((s,l) => { const p = getLeadPotencial(l); return normalizeCurrencyCode(p.moneda) === 'USD' ? s + p.monto : s; }, 0);
          const icons = [I.plus, I.users, I.star, I.check, I.x];
          const colors = ['var(--cyan)', 'var(--orange)', 'var(--purple)', 'var(--green)', 'var(--slate-400)'];
          return (
            <div key={c.k} className={`pipeline-kpi-card hover-raise`} style={{'--accent': c.color}}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>
                {icons[i]}
              </div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div style={{display:'flex', flexDirection:'column', gap:2}}>
                <div className="pipeline-kpi-value" style={{fontSize:'0.95em'}}>{money(sumPEN)}</div>
                <div className="pipeline-kpi-value" style={{fontSize:'0.95em'}}>{money(sumUSD, 'US$')}</div>
              </div>
              <div className="pipeline-kpi-count">{list.length} lead{list.length !== 1 ? 's' : ''}</div>
              <p style={{fontSize:'0.7rem', color:'var(--color-slate)', fontStyle:'italic', marginTop:'6px', lineHeight:'1.3'}}>{c.hint}</p>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = filteredLeads
                .filter(l => l.estado === c.k)
                .sort((a, b) => (b.moved_at || 0) - (a.moved_at || 0) || (b.fecha_creacion || '').localeCompare(a.fecha_creacion || ''));
              const colors = ['var(--cyan)', 'var(--orange)', 'var(--purple)', 'var(--green)', 'var(--slate-400)'];
              return (
                <div
                  key={c.k}
                  className="kanban-col-v2"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1, paddingBottom:10}}>
                    {list.length > 0 ? (
                      list.map(l => (
                        (() => {
                          const diasSinActividad = Number(l.dias_sin_actividad || 0);
                          const diasColor = diasSinActividad >= 7 ? 'badge-red' : diasSinActividad >= 3 ? 'badge-orange' : 'badge-gray';
                          const { score: lScore, label: lLabel, color: lColor } = calcularScoreLead(l);
                          const potencial = getLeadPotencial(l);
                          return (
                        <div
                          key={l.id}
                          className="kanban-card-v2"
                          draggable
                          onDragStart={(e) => startKanbanDrag(e, l.id)}
                          onDragEnd={endKanbanDrag}
                          onClick={() => setSel(l)}
                          style={{cursor: 'pointer'}}
                        >
                          <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8}}>
                            <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', lineHeight:1.4, minWidth:0}}>
                              {l.nombre}
                            </div>
                            <div className="row" style={{gap:4, flexShrink:0}}>
                              <button
                                type="button"
                                className="icon-btn"
                                title="Editar lead"
                                draggable={false}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); abrirEditarLead(l); }}
                                style={{width:26, height:26}}
                              >
                                {I.edit}
                              </button>
                            </div>
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:10}}>
                            {l.empresa_contacto}
                          </div>
                          
                          <div style={{fontSize:14, fontWeight:800, color: 'var(--navy)', marginBottom:8}}>
                            {moneyCurrency(potencial.monto, potencial.moneda)}
                          </div>

                          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10}}>
                            <div style={{flex:1, height:3, borderRadius:99, background:'var(--border)', overflow:'hidden'}}>
                              <div style={{width:`${lScore}%`, height:'100%', borderRadius:99, background:lColor}}/>
                            </div>
                            <span style={{fontSize:9, fontWeight:700, color:lColor, flexShrink:0, lineHeight:1}}>{lScore}pt · {lLabel}</span>
                          </div>

                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                              <span className="badge badge-gray" style={{fontSize:9, padding:'1px 6px'}}>{l.fuente}</span>
                              <span className={'badge '+diasColor} style={{fontSize:9, padding:'1px 6px'}}>{diasSinActividad}d sin act.</span>
                              <div className="text-muted" style={{fontSize:10}}>{l.fecha_creacion}</div>
                            </div>
                            <div className="avatar" style={{width:24, height:24, fontSize:10, margin:0, background:'var(--navy)', color:'#fff'}}>
                              {l.responsable?.charAt(0) || 'U'}
                            </div>
                          </div>
                        </div>
                          );
                        })()
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.5}}>{[I.plus, I.users, I.star, I.check, I.x][i]}</div>
                        <p>Sin leads en {c.title}<br/><span style={{fontSize:10}}>Arrastra aquí para actualizar.</span></p>
                      </div>
                    )}
                  </div>
  
                  <button className="kanban-btn-add" data-local-form="true" onClick={() => setPanelNuevo(true)}>
                    {I.plus} Agregar lead
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Empresa</th>
                  <th>Presupuesto</th>
                  <th>Fuente</th>
                  <th>Responsable</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => {
                  const potencial = getLeadPotencial(l);
                  return (
                    <tr key={l.id} className="hover-row" onClick={() => setSel(l)}>
                      <td><div style={{fontWeight:600}}>{l.nombre}</div><div className="text-muted" style={{fontSize:11}}>{l.cargo}</div></td>
                      <td>{l.empresa_contacto}</td>
                      <td><strong>{moneyCurrency(potencial.monto, potencial.moneda)}</strong></td>
                      <td><span className="badge badge-gray">{l.fuente}</span></td>
                      <td>{l.responsable}</td>
                      <td className="text-muted">{l.fecha_creacion}</td>
                      <td><span className={'badge badge-' + (l.estado==='convertido'?'green':l.estado==='descartado'?'gray':'cyan')}>{(l.estado || '').toUpperCase()}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && (() => {
        const diasSinActividad = Number(sel.dias_sin_actividad || 0);
        const diasBadge = diasSinActividad >= 7 ? 'badge-red' : diasSinActividad >= 3 ? 'badge-orange' : 'badge-green';
        const estadoBadge = sel.estado === 'convertido' ? 'badge-green' : sel.estado === 'descartado' ? 'badge-gray' : 'badge-cyan';
        const urgenciaBadge = sel.urgencia === 'alta' ? 'badge-red' : sel.urgencia === 'baja' ? 'badge-gray' : 'badge-orange';
        const campanaNombre = sel.campana_id ? (campanas.find(c => c.id === sel.campana_id)?.nombre || sel.campana_id) : (sel.campana || '');
        const potencialSel = getLeadPotencial(sel);
        const Field = ({ label, value, strong }) => (
          <div style={{minWidth:0}}>
            <div className="eyebrow" style={{marginBottom:5}}>{label}</div>
            <div style={{fontSize:13, fontWeight:strong ? 700 : 500, color:value ? 'var(--fg)' : 'var(--fg-muted)', lineHeight:1.35, overflowWrap:'anywhere'}}>
              {value || 'Pendiente'}
            </div>
          </div>
        );
        const SectionTitle = ({ icon, title, color }) => (
          <div className="row" style={{gap:9, marginBottom:14}}>
            <span style={{width:32, height:32, borderRadius:9, display:'inline-flex', alignItems:'center', justifyContent:'center', color, background:'var(--bg-subtle)', flex:'0 0 auto'}}>
              <span style={{width:19, height:19, display:'inline-flex'}}>{icon}</span>
            </span>
            <strong style={{fontSize:13, color:'var(--fg)'}}>{title}</strong>
          </div>
        );
        return (
          <>
            <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
            <div className="side-panel ficha-detail-panel" style={{width:'min(680px,96vw)'}}>
              <div className="side-panel-head" style={{alignItems:'flex-start', flexDirection:'column', gap:10}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', width:'100%'}}>
                  <div style={{minWidth:0}}>
                    <div className="eyebrow">Ficha de lead</div>
                    <div className="font-display ficha-detail-title" style={{marginTop:4}}>{sel.nombre || 'Lead sin nombre'}</div>
                    <div className="row" style={{gap:8, marginTop:10, flexWrap:'wrap'}}>
                      <span className={'badge '+estadoBadge} style={{textTransform:'capitalize'}}>{(sel.estado || 'nuevo').replace('_',' ')}</span>
                      <span className={'badge '+urgenciaBadge} style={{textTransform:'capitalize'}}>Urgencia {sel.urgencia || 'media'}</span>
                      <span className={'badge '+diasBadge}>{diasSinActividad}d sin actividad</span>
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
                </div>
                {['nuevo', 'en_contacto'].includes(sel.estado) && (
                  <div style={{width:'100%', padding:'8px 12px', background:'var(--orange-lt)', color:'var(--orange-dk)', borderRadius:8, fontSize:12, fontWeight:500, border:'1px solid rgba(255,152,0,0.3)', lineHeight:1.45}}>
                    Avanza el lead por el tablero hasta <strong>Calificado</strong> antes de convertirlo.
                  </div>
                )}
              </div>
              <div className="side-panel-body" style={{padding:0}}>
                {(({ score, label, color, bgLight, criterios }) => (
                  <div style={{padding:'16px 22px 18px', borderBottom:'1px solid var(--border)', background:bgLight}}>
                    <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:14}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:8}}>
                          <span className="ficha-detail-score" style={{color}}>{score}</span>
                          <span style={{fontSize:12, color:'var(--fg-muted)'}}>/ 100</span>
                          <span style={{fontSize:11, fontWeight:700, color, padding:'2px 10px', borderRadius:99, border:`1px solid ${color}`}}>{label}</span>
                        </div>
                        <div style={{height:6, borderRadius:99, background:'var(--border)', overflow:'hidden'}}>
                          <div style={{width:`${score}%`, height:'100%', borderRadius:99, background:color, transition:'width 0.4s'}}/>
                        </div>
                      </div>
                    </div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 20px'}}>
                      {criterios.map((c, i) => (
                        <div key={i} style={{display:'flex', alignItems:'center', gap:6}}>
                          <span style={{
                            width:14, height:14, flex:'0 0 14px', display:'inline-flex', alignItems:'center', justifyContent:'center',
                            color: c.estado === 'suma' ? 'var(--green)' : c.estado === 'resta' ? 'var(--danger)' : 'var(--fg-muted)'
                          }}>
                            {c.estado === 'suma' ? I.check : c.estado === 'resta' ? I.x : <span style={{fontSize:14, lineHeight:1}}>–</span>}
                          </span>
                          <span style={{fontSize:10.5, lineHeight:1.3, color: c.estado === 'neutro' ? 'var(--fg-muted)' : 'var(--fg)'}}>
                            {c.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))(calcularScoreLead(sel))}

                <div className="ficha-detail-tabs" style={{padding:'0 22px', borderBottom:'1px solid var(--border)', display:'flex', gap:4}}>
                  {[['detalles','Detalles'],['timeline','Timeline']].map(([k,lbl]) => (
                    <button key={k} className={`ficha-detail-tab ${fichaTab===k?'active':''}`} onClick={() => setFichaTab(k)}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <div className="ficha-detail-content">

                {fichaTab === 'detalles' && <>
                <div style={{padding:'20px 22px 22px', background:'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(26,43,74,0.04))', borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'stretch'}}>
                    <div style={{padding:18, border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)', boxShadow:'var(--shadow-sm)'}}>
                      <div className="eyebrow" style={{marginBottom:8}}>Empresa objetivo</div>
                      <div style={{fontSize:20, fontWeight:800, color:'var(--navy)', lineHeight:1.15}}>{sel.empresa_contacto || 'Empresa pendiente'}</div>
                      <div className="text-muted" style={{fontSize:12, marginTop:8}}>{sel.razon_social || 'Sin razon social legal'}{sel.ruc ? ` · RUC ${sel.ruc}` : ''}</div>
                    </div>
                    <div style={{padding:18, border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)', boxShadow:'var(--shadow-sm)'}}>
                      <div className="eyebrow" style={{marginBottom:8}}>Potencial</div>
                      <div className="font-display" style={{fontSize:24, fontWeight:800, color:'var(--navy)'}}>{moneyCurrency(potencialSel.monto, potencialSel.moneda)}</div>
                      <div className="text-muted" style={{fontSize:12, marginTop:8}}>{potencialSel.moneda || 'PEN'} · {potencialSel.fuente === 'cotizacion' ? 'Cotización vinculada' : sel.fuente || 'Fuente pendiente'}</div>
                    </div>
                  </div>
                </div>

                <div style={{padding:22, display:'grid', gap:18}}>
                  <div style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:14}}>
                    <div style={{border:'1px solid var(--border)', borderRadius:10, padding:16, background:'var(--surface)'}}>
                      <SectionTitle icon={I.building} title="Empresa" color="var(--cyan)" />
                      <div style={{display:'grid', gap:13}}>
                        <Field label="Nombre comercial" value={sel.empresa_contacto} strong />
                        <Field label="Razon social legal" value={sel.razon_social} />
                        <Field label="RUC" value={sel.ruc} />
                        <Field label="Industria" value={sel.industria} />
                      </div>
                    </div>
                    <div style={{border:'1px solid var(--border)', borderRadius:10, padding:16, background:'var(--surface)'}}>
                      <SectionTitle icon={I.users} title="Contacto" color="var(--purple)" />
                      <div style={{display:'grid', gap:13}}>
                        <Field label="Nombre" value={sel.nombre} strong />
                        <Field label="Cargo" value={sel.cargo} />
                        <Field label="Telefono" value={sel.telefono} />
                        <Field label="Email" value={sel.email} />
                      </div>
                    </div>
                  </div>

                  <div style={{border:'1px solid var(--border)', borderRadius:10, padding:16, background:'var(--surface)'}}>
                    <SectionTitle icon={I.target} title="Oportunidad" color="var(--orange)" />
                    <div style={{display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:14, marginBottom:14}}>
                      <Field label="Presupuesto estimado" value={moneyCurrency(potencialSel.monto, potencialSel.moneda)} strong />
                      <Field label="Urgencia" value={sel.urgencia} />
                      <Field label="Dias sin actividad" value={`${diasSinActividad} dias`} strong />
                      {sel.servicio_interes && <Field label="Servicio de interés" value={sel.servicio_interes} style={{gridColumn:'1/-1'}} />}
                    </div>
                    <div style={{padding:'12px 14px', background:'var(--bg-subtle)', borderRadius:8, fontSize:13, lineHeight:1.5, minHeight:56}}>
                      {sel.necesidad || 'Sin necesidad registrada.'}
                    </div>
                  </div>

                  <div style={{border:'1px solid var(--border)', borderRadius:10, padding:16, background:'var(--surface)'}}>
                    <SectionTitle icon={I.clipboard} title="Asignacion y origen" color="var(--green)" />
                    <div style={{display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:14}}>
                      <Field label="Responsable comercial" value={sel.responsable} strong />
                      <Field label="Fuente" value={sel.fuente} />
                      <Field label="Registrado desde" value={sel.registrado_desde} />
                      <Field label="Fecha de creacion" value={sel.fecha_creacion} />
                      <Field label="Campana" value={campanaNombre} />
                      <Field label="ID lead" value={sel.id} />
                    </div>
                  </div>

                  {sel.motivo_descarte && (
                    <div style={{border:'1px solid rgba(239,68,68,0.28)', borderRadius:10, padding:16, background:'rgba(239,68,68,0.06)'}}>
                      <div className="eyebrow" style={{marginBottom:6}}>Motivo de descarte</div>
                      <div style={{fontSize:13, color:'var(--danger)', lineHeight:1.45}}>{sel.motivo_descarte}</div>
                    </div>
                  )}

                  {sel.estado !== 'descartado' && (
                    <div className="row" style={{gap:10, justifyContent:'flex-end', paddingTop:4, flexWrap:'wrap'}}>
                      {sel.estado === 'calificado' && !sel.convertido && (
                        <button className="btn btn-primary" style={{minWidth:160}} onClick={() => { setModalConvertir(sel); setSel(null); }}>{I.check} Convertir</button>
                      )}
                      <button className="btn btn-secondary" onClick={() => navigate('actividades')}>Registrar Actividad</button>
                      <button className="btn btn-secondary" onClick={() => abrirEditarLead(sel)}>{I.edit} Editar</button>
                      {sel.estado !== 'convertido' && (
                        <button className="btn btn-ghost" onClick={() => { abrirMoverModal(sel, 'descartado'); setSel(null); }}>Descartar</button>
                      )}
                      {sel.estado === 'nuevo' && (
                        <button className="btn btn-ghost" style={{color:'var(--danger)'}} onClick={() => setModalEliminarLead(sel)}>{I.trash} Eliminar</button>
                      )}
                    </div>
                  )}
                  {sel.estado === 'descartado' && (
                    <div className="row" style={{gap:10, justifyContent:'flex-end', paddingTop:4}}>
                      <button className="btn btn-primary" onClick={() => setModalReactivar(sel)}>{I.refresh} Reactivar lead</button>
                    </div>
                  )}
                </div>
                </>}

                {fichaTab === 'timeline' && (() => {
                  const hoyD = new Date(); hoyD.setHours(0,0,0,0);
                  const hace1 = new Date(hoyD.getTime() - 86400000);
                  const fmtISO = d => d.toISOString().split('T')[0];

                  const actividadesLead = (actividades || []).filter(a => a.lead_id === sel.id).map(a => ({
                    id: a.id, tipo: 'actividad',
                    fecha: a.fecha || fmtISO(hoyD),
                    titulo: `${a.tipo ? a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1) : 'Actividad'}: ${(a.titulo || a.descripcion || 'Sin título').slice(0, 50)}`,
                    descripcion: a.resultado || a.descripcion || '',
                    usuario: a.responsable || a.vendedor || sel.responsable || '—',
                    modulo: 'actividades',
                  }));

                  const historialLead = (historialEstados || [])
                    .filter(h => h.lead_id === sel.id)
                    .map(h => {
                      const esReactivacion = h.estado_desde === 'descartado' && h.estado_hasta === 'en_contacto';
                      return {
                        id: h.id,
                        tipo: esReactivacion ? 'reactivacion' : 'estado',
                        fecha: h.creado_en?.split('T')[0] || fmtISO(hoyD),
                        ts: h.creado_en || null,
                        titulo: esReactivacion
                          ? 'Lead reactivado'
                          : `Estado: ${(h.estado_desde || '').replace('_',' ')} → ${(h.estado_hasta || '').replace('_',' ')}`,
                        descripcion: h.motivo || '',
                        usuario: sel.responsable || '—',
                      };
                    });

                  const eventos = [
                    { id: `${sel.id}_crea`, tipo: 'creacion', fecha: sel.fecha_creacion || fmtISO(hoyD),
                      titulo: 'Lead registrado',
                      descripcion: `Origen: ${sel.fuente || 'Manual'} · Registrado desde: ${sel.registrado_desde || 'backoffice'}`,
                      usuario: sel.responsable || 'Sistema' },
                    ...(sel.convertido ? [{ id: `${sel.id}_conv`, tipo: 'conversion', fecha: sel.fecha_creacion || fmtISO(hoyD),
                      titulo: 'Lead convertido a oportunidad',
                      descripcion: 'Cuenta y oportunidad creadas correctamente.',
                      usuario: sel.responsable || 'Sistema',
                      modulo: 'pipeline' }] : []),
                    ...actividadesLead,
                    ...historialLead,
                  ];

                  const tipoConfig = {
                    creacion:     { color: 'var(--cyan)',   icon: I.plus,      bg: 'rgba(6,182,212,0.12)' },
                    estado:       { color: '#64748b',       icon: I.arrowUp,   bg: 'rgba(100,116,139,0.12)' },
                    reactivacion: { color: 'var(--orange)', icon: I.refresh,   bg: 'rgba(249,115,22,0.12)' },
                    actividad:    { color: 'var(--navy)',   icon: I.clipboard, bg: 'rgba(26,43,74,0.12)' },
                    conversion:   { color: 'var(--green)',  icon: I.check,     bg: 'rgba(16,185,129,0.12)' },
                  };

                  let filtrados = eventos.filter(ev => {
                    if (tlFiltroTipo === 'estados' && !['estado', 'reactivacion'].includes(ev.tipo)) return false;
                    if (tlFiltroTipo === 'actividades' && ev.tipo !== 'actividad') return false;
                    if (tlFiltroDesde && ev.fecha < tlFiltroDesde) return false;
                    if (tlFiltroHasta && ev.fecha > tlFiltroHasta) return false;
                    return true;
                  });
                  filtrados = [...filtrados].sort((a, b) => {
                    const ta = a.ts || a.fecha;
                    const tb = b.ts || b.fecha;
                    return tb.localeCompare(ta);
                  });

                  const fmtLabel = fechaStr => {
                    if (fechaStr === fmtISO(hoyD)) return 'Hoy';
                    if (fechaStr === fmtISO(hace1)) return 'Ayer';
                    const d = new Date(fechaStr + 'T12:00:00');
                    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                  };

                  const grupos = [];
                  filtrados.forEach(ev => {
                    const lbl = fmtLabel(ev.fecha);
                    if (!grupos.length || grupos[grupos.length - 1].label !== lbl) grupos.push({ label: lbl, eventos: [] });
                    grupos[grupos.length - 1].eventos.push(ev);
                  });

                  return (
                    <div style={{padding: '14px 22px 28px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap'}}>
                        <select className="input" value={tlFiltroTipo} onChange={e => setTlFiltroTipo(e.target.value)} style={{fontSize: 12, padding: '4px 8px', height: 'auto', width: 'auto', minWidth: 140}}>
                          <option value="todos">Todos los eventos</option>
                          <option value="estados">Solo estados</option>
                          <option value="actividades">Solo actividades</option>
                        </select>
                        <input type="date" className="input" value={tlFiltroDesde} onChange={e => setTlFiltroDesde(e.target.value)} style={{fontSize: 12, padding: '4px 8px', height: 'auto', width: 'auto'}}/>
                        <input type="date" className="input" value={tlFiltroHasta} onChange={e => setTlFiltroHasta(e.target.value)} style={{fontSize: 12, padding: '4px 8px', height: 'auto', width: 'auto'}}/>
                        {(tlFiltroTipo !== 'todos' || tlFiltroDesde || tlFiltroHasta) && (
                          <button className="btn btn-ghost" style={{fontSize: 11, padding: '4px 10px', height: 'auto'}} onClick={() => { setTlFiltroTipo('todos'); setTlFiltroDesde(''); setTlFiltroHasta(''); }}>
                            Limpiar
                          </button>
                        )}
                      </div>

                      {filtrados.length === 0 ? (
                        <div style={{textAlign: 'center', padding: '32px 0', color: 'var(--fg-muted)', fontSize: 13}}>
                          Sin actividad registrada para este lead.
                        </div>
                      ) : grupos.map((g, gi) => (
                        <div key={gi}>
                          <div style={{display: 'flex', alignItems: 'center', gap: 10, margin: `${gi === 0 ? 0 : 8}px 0 14px`}}>
                            <div style={{flex: 1, height: 1, background: 'var(--border)'}}/>
                            <span style={{fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap'}}>{g.label}</span>
                            <div style={{flex: 1, height: 1, background: 'var(--border)'}}/>
                          </div>
                          {g.eventos.map((ev, ei) => {
                            const cfg = tipoConfig[ev.tipo] || tipoConfig.estado;
                            const isLast = gi === grupos.length - 1 && ei === g.eventos.length - 1;
                            return (
                              <div key={ev.id} style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flex: '0 0 32px'}}>
                                  <div style={{width: 30, height: 30, borderRadius: 99, background: cfg.bg, border: `1.5px solid ${cfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cfg.color, flex: '0 0 30px'}}>
                                    <span style={{width: 13, height: 13, display: 'inline-flex'}}>{cfg.icon}</span>
                                  </div>
                                  {!isLast && <div style={{width: 2, flex: 1, background: 'var(--border)', marginTop: 4, minHeight: 20}}/>}
                                </div>
                                <div style={{flex: 1, paddingBottom: isLast ? 0 : 20}}>
                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3}}>
                                    <div style={{fontWeight: 700, fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.35}}>{ev.titulo}</div>
                                    <div style={{fontSize: 10.5, color: 'var(--fg-muted)', flexShrink: 0}}>{ev.fecha}</div>
                                  </div>
                                  {ev.descripcion && <div style={{fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 5}}>{ev.descripcion}</div>}
                                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                    <div style={{fontSize: 11, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4}}>
                                      <span style={{width: 11, height: 11, display: 'inline-flex', opacity: 0.6}}>{I.users}</span>
                                      {ev.usuario}
                                    </div>
                                    {ev.modulo && (
                                      <button className="btn btn-ghost" style={{fontSize: 10.5, padding: '2px 8px', height: 'auto', lineHeight: 1.4}} onClick={() => navigate(ev.modulo)}>
                                        Ver en módulo →
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {false && sel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
          <div className="side-panel">
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Lead</div>
                <div className="font-display" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.nombre}</div>
              </div>
              <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="col" style={{gap:12}}>
                <div><div className="eyebrow">Empresa</div><div style={{fontWeight:600}}>{sel.empresa_contacto}</div></div>
                <div><div className="eyebrow">Cargo</div><div>{sel.cargo}</div></div>
                <div><div className="eyebrow">Contacto</div><div>{sel.telefono} · {sel.email}</div></div>
                <div><div className="eyebrow">Necesidad</div><div>{sel.necesidad}</div></div>
                <div><div className="eyebrow">Presupuesto Estimado</div><div style={{fontFamily:'Sora', fontWeight:700}}>{money(sel.presupuesto_estimado)}</div></div>
                <div><div className="eyebrow">Responsable</div><div>{sel.responsable}</div></div>
                <div><div className="eyebrow">Días sin actividad</div><div style={{fontFamily:'Sora', fontWeight:700}}>{Number(sel.dias_sin_actividad || 0)} días</div></div>
                <div><div className="eyebrow">Estado</div><div style={{textTransform:'capitalize'}}>{sel.estado.replace('_',' ')}</div></div>
                {(sel.campana_id || sel.campana) && (
                  <div>
                    <div className="eyebrow">Campaña</div>
                    <div style={{fontSize:13}}>
                      {sel.campana_id
                        ? (campanas.find(c => c.id === sel.campana_id)?.nombre || sel.campana_id)
                        : <span>{sel.campana} <span className="text-muted" style={{fontSize:11}}>(sin vincular)</span></span>
                      }
                    </div>
                  </div>
                )}
                {sel.motivo_descarte && <div><div className="eyebrow">Motivo Descarte</div><div className="text-muted">{sel.motivo_descarte}</div></div>}
              </div>

              {sel.estado !== 'descartado' && (
                <div className="row mt-6" style={{gap:10}}>
                  {sel.estado !== 'convertido' && (
                    <button className="btn btn-primary flex-1" onClick={() => { setModalConvertir(sel); setSel(null); }}>{I.check} Convertir</button>
                  )}
                  <button className="btn btn-secondary" onClick={() => navigate('actividades')}>Registrar Actividad</button>
                  <button className="btn btn-secondary" onClick={() => abrirEditarLead(sel)}>{I.edit} Editar</button>
                  {sel.estado !== 'convertido' && (
                    <>
                      <button className="btn btn-ghost" onClick={() => { setModalDescartar(sel); setSel(null); }}>Descartar</button>
                      <button className="icon-btn" title="Eliminar lead" style={{color:'var(--danger)'}} onClick={() => confirmarEliminarLead(sel)}>{I.trash}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {modalConvertir && convForm && (() => {
        const rucError = !isValidRuc(convForm.ruc) || !convForm.ruc;
        const telError = !isValidPhone(convForm.contacto_telefono) || !convForm.contacto_telefono;
        const canSubmit =
          convForm.nombre_comercial.trim() &&
          convForm.razon_social.trim() &&
          convForm.ruc && isValidRuc(convForm.ruc) &&
          convForm.fuente &&
          convForm.industria &&
          convForm.contacto_nombre.trim() &&
          convForm.contacto_cargo.trim() &&
          convForm.contacto_telefono && isValidPhone(convForm.contacto_telefono) &&
          convForm.contacto_email.trim() &&
          convForm.nombre_oportunidad.trim() &&
          String(convForm.monto_estimado).trim();
        const req = <span style={{color:'var(--danger)',marginLeft:2}}>*</span>;
        const secStyle = {background:'var(--bg-subtle,rgba(0,0,0,0.025))', borderRadius:10, padding:'14px 16px'};
        const emptyStyle = (val) => (!val || !String(val).trim()) ? {borderColor:'var(--danger)'} : {};
        return (
          <div className="modal-backdrop">
            <div className="modal" style={{maxWidth:640, maxHeight:'90vh', overflowY:'auto'}}>
              <div className="modal-head">
                <h2>Convertir Lead en Oportunidad</h2>
                <button className="icon-btn" onClick={() => setModalConvertir(null)}>{I.x}</button>
              </div>
              <div className="modal-body col" style={{gap:16}}>

                <div style={secStyle}>
                  <div className="eyebrow" style={{marginBottom:10}}>Cuenta</div>
                  <div className="col" style={{gap:10}}>
                    <div className="grid-2">
                      <div className="input-group">
                        <label>Nombre Comercial{req}</label>
                        <input className="input" value={convForm.nombre_comercial}
                          style={emptyStyle(convForm.nombre_comercial)}
                          onChange={e=>setConvForm(p=>({...p,nombre_comercial:e.target.value}))} autoFocus/>
                      </div>
                      <div className="input-group">
                        <label>Razón Social{req}</label>
                        <input className="input" value={convForm.razon_social}
                          style={emptyStyle(convForm.razon_social)}
                          onChange={e=>setConvForm(p=>({...p,razon_social:e.target.value}))}/>
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="input-group">
                        <label>RUC{req} <span className="text-subtle" style={{fontWeight:400,fontSize:11}}>(11 dígitos, inicia en 1 o 2)</span></label>
                        <input className="input" value={convForm.ruc} maxLength={11}
                          style={rucError ? {borderColor:'var(--danger)'} : {}}
                          onChange={e=>setConvForm(p=>({...p,ruc:sanitizeRuc(e.target.value)}))}/>
                        {rucError && <span style={{fontSize:11,color:'var(--danger)'}}>11 dígitos, inicia con 1 o 2</span>}
                      </div>
                      <div className="input-group">
                        <label>Fuente{req}</label>
                        <select className="select" value={convForm.fuente}
                          style={!convForm.fuente ? {borderColor:'var(--danger)'} : {}}
                          onChange={e=>setConvForm(p=>({...p,fuente:e.target.value}))}>
                          <option value="">Seleccionar...</option>
                          {['Referido','Formulario web','LinkedIn','Evento / Feria','Cold outreach','Manual'].map(f=><option key={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="input-group">
                      <label>Industria{req}</label>
                      <select className="select" value={convForm.industria}
                        style={!convForm.industria ? {borderColor:'var(--danger)'} : {}}
                        onChange={e=>setConvForm(p=>({...p,industria:e.target.value}))}>
                        <option value="">Seleccionar...</option>
                        {opcionesIndustria.map(i=><option key={i}>{i}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={secStyle}>
                  <div className="eyebrow" style={{marginBottom:10}}>Contacto</div>
                  <div className="col" style={{gap:10}}>
                    <div className="grid-2">
                      <div className="input-group">
                        <label>Nombre{req}</label>
                        <input className="input" value={convForm.contacto_nombre}
                          style={emptyStyle(convForm.contacto_nombre)}
                          onChange={e=>setConvForm(p=>({...p,contacto_nombre:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label>Cargo{req}</label>
                        <input className="input" value={convForm.contacto_cargo}
                          style={emptyStyle(convForm.contacto_cargo)}
                          onChange={e=>setConvForm(p=>({...p,contacto_cargo:e.target.value}))}/>
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="input-group">
                        <label>Celular{req} <span className="text-subtle" style={{fontWeight:400,fontSize:11}}>(9 dígitos, inicia en 9)</span></label>
                        <input className="input" value={convForm.contacto_telefono} maxLength={9}
                          style={telError ? {borderColor:'var(--danger)'} : {}}
                          onChange={e=>setConvForm(p=>({...p,contacto_telefono:sanitizePhone(e.target.value)}))}/>
                        {telError && <span style={{fontSize:11,color:'var(--danger)'}}>9 dígitos, inicia con 9</span>}
                      </div>
                      <div className="input-group">
                        <label>Email{req}</label>
                        <input className="input" type="email" value={convForm.contacto_email}
                          style={emptyStyle(convForm.contacto_email)}
                          onChange={e=>setConvForm(p=>({...p,contacto_email:e.target.value}))}/>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={secStyle}>
                  <div className="eyebrow" style={{marginBottom:10}}>Oportunidad</div>
                  <div className="col" style={{gap:10}}>
                    <div className="input-group">
                      <label>Nombre de la Oportunidad{req}</label>
                      <input className="input" value={convForm.nombre_oportunidad}
                        style={emptyStyle(convForm.nombre_oportunidad)}
                        onChange={e=>setConvForm(p=>({...p,nombre_oportunidad:e.target.value}))}/>
                    </div>
                    <div className="grid-2">
                      <div className="input-group">
                        <label>Monto Estimado{req}</label>
                        <input className="input" type="number" value={convForm.monto_estimado}
                          style={!String(convForm.monto_estimado).trim() ? {borderColor:'var(--danger)'} : {}}
                          onChange={e=>setConvForm(p=>({...p,monto_estimado:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label>Moneda</label>
                        <select className="select" value={convForm.moneda} onChange={e=>setConvForm(p=>({...p,moneda:e.target.value}))}>
                          {monedasActivas.map(m=><option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="input-group" style={{maxWidth:260}}>
                      <label>Etapa Inicial</label>
                      <div style={{fontSize:13, color:'var(--text-muted)', padding:'8px 10px', background:'var(--bg-soft)', borderRadius:6, border:'1px solid var(--border)'}}>
                        La oportunidad iniciará en etapa <strong style={{color:'var(--text)'}}>Calificación</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-foot" style={{flexDirection:'column', alignItems:'flex-end', gap:8}}>
                  {!canSubmit && <span style={{fontSize:11,color:'var(--danger)'}}>Completa todos los campos obligatorios (*)</span>}
                  <div className="row" style={{gap:10}}>
                    <button type="button" className="btn btn-secondary" onClick={() => setModalConvertir(null)}>Cancelar</button>
                    <button type="button" className="btn btn-primary" data-local-form="true" disabled={!canSubmit} onClick={() => {
                      convertirLead(modalConvertir.id, convForm);
                      setModalConvertir(null);
                    }}>{I.check} Convertir y crear cuenta</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {modalMoverLead && (() => {
        const cfgMap = {
          en_contacto: { titulo: 'Primer contacto', placeholder: '¿Cómo fue el primer contacto? ¿Llamada, visita, email?' },
          calificado:  { titulo: 'Calificar lead', placeholder: '¿Por qué califica este lead? ¿Confirmaste necesidad, presupuesto y decisión?' },
          descartado:  { titulo: 'Descartar lead', placeholder: '¿Por qué se descarta este lead?' },
          nuevo:       { titulo: 'Regresar a Nuevo', placeholder: '¿Por qué regresa a Nuevo este lead?' },
        };
        const cfg = cfgMap[modalMoverLead.destino] || { titulo: 'Cambiar estado', placeholder: 'Escribe el motivo...' };
        return (
          <div className="modal-backdrop">
            <div className="modal" style={{maxWidth:420}}>
              <div className="modal-head">
                <h2 style={{color:'var(--navy)'}}>{cfg.titulo}</h2>
                <button className="icon-btn" onClick={() => setModalMoverLead(null)}>{I.x}</button>
              </div>
              <div className="modal-body col" style={{gap:12}}>
                <div className="input-group">
                  <textarea className="input" rows={2} placeholder={cfg.placeholder} value={moverMotivo}
                    onChange={e => { setMoverMotivo(e.target.value); setMoverError(''); }}
                    style={moverError ? {borderColor:'var(--danger)'} : {}} autoFocus />
                  {moverError && <div style={{fontSize:12, color:'var(--danger)', marginTop:4}}>{moverError}</div>}
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn btn-secondary" onClick={() => setModalMoverLead(null)}>Cancelar</button>
                <button className="btn btn-primary" style={{background:'var(--green)', borderColor:'var(--green)'}}
                  onClick={() => {
                    const { lead, destino } = modalMoverLead;
                    if (destino === 'calificado' && !(getLeadPotencial(lead).monto > 0)) {
                      setMoverError('Para calificar este lead debes registrar un presupuesto estimado.');
                      return;
                    }
                    if (!moverMotivo.trim()) { setMoverError('El motivo es obligatorio.'); return; }
                    if (destino === 'descartado') {
                      descartarLead(lead.id, moverMotivo.trim());
                    } else {
                      updateLeadState(lead.id, destino, moverMotivo.trim());
                    }
                    setModalMoverLead(null);
                    setMoverMotivo('');
                    setMoverError('');
                  }}>
                  Confirmar movimiento
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {modalEliminarLead && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-head">
              <h2>Eliminar lead</h2>
              <button className="icon-btn" onClick={() => setModalEliminarLead(null)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <p>¿Eliminar este lead? Esta acción no se puede deshacer. Si el lead ya tuvo contacto, usa <strong>Descartar</strong> en su lugar.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModalEliminarLead(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{background:'var(--danger)', borderColor:'var(--danger)'}} onClick={async () => {
                await eliminarLead(modalEliminarLead.id);
                if (sel?.id === modalEliminarLead.id) setSel(null);
                setModalEliminarLead(null);
              }}>{I.trash} Eliminar definitivamente</button>
            </div>
          </div>
        </div>
      )}

      {modalConvertirDrag && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:440}}>
            <div className="modal-head">
              <h2>Convertir lead</h2>
              <button className="icon-btn" onClick={() => setModalConvertirDrag(null)}>{I.x}</button>
            </div>
            <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:12}}>
              <div style={{display:'flex', gap:10, padding:'10px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8}}>
                <span style={{flex:'0 0 18px', color:'var(--orange)', marginTop:1}}>{I.alert}</span>
                <p style={{margin:0, fontSize:13, color:'#92400e', lineHeight:1.5}}>
                  Al mover <strong>{modalConvertirDrag.nombre}</strong> a Convertido se crearán automáticamente en el sistema:
                </p>
              </div>
              <ul style={{margin:0, padding:'0 0 0 20px', fontSize:13, color:'var(--text)', lineHeight:2}}>
                <li>Una <strong>cuenta</strong> en el módulo de Cuentas</li>
                <li>Un <strong>contacto</strong> asociado a esa cuenta</li>
                <li>Una <strong>oportunidad de venta</strong> en el Pipeline</li>
              </ul>
              <p style={{margin:0, fontSize:12, color:'var(--text-muted)'}}>
                Si ya existe una cuenta con el mismo RUC o un contacto con el mismo correo, no se duplicarán.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModalConvertirDrag(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                const lead = modalConvertirDrag;
                setModalConvertirDrag(null);
                setModalConvertir(lead);
              }}>Continuar con la conversión</button>
            </div>
          </div>
        </div>
      )}

      {kanbanToast && (
        <div style={{position:'fixed', bottom:32, left:'50%', transform:'translateX(-50%)', zIndex:9999, background:'var(--navy)', color:'#fff', padding:'12px 20px', borderRadius:10, fontSize:13, fontWeight:500, boxShadow:'0 4px 20px rgba(0,0,0,0.25)', display:'flex', alignItems:'center', gap:10, maxWidth:420, lineHeight:1.4, pointerEvents:'none'}}>
          <span style={{width:18, height:18, flex:'0 0 18px', display:'inline-flex', color:'var(--orange)'}}>{I.alert}</span>
          {kanbanToast}
        </div>
      )}

      {modalReactivar && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:440}}>
            <div className="modal-head">
              <h2>Reactivar lead</h2>
              <button className="icon-btn" onClick={() => setModalReactivar(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={(e) => {
              e.preventDefault();
              const motivo = new FormData(e.target).get('motivo');
              reactivarLead(modalReactivar.id, motivo);
              setSel(null);
              setModalReactivar(null);
            }}>
              <div className="input-group">
                <label>¿Qué cambió? ¿Por qué se reactiva este lead? *</label>
                <textarea name="motivo" className="input" required rows="4" placeholder="Describe qué nueva información o cambio de situación justifica retomar este lead..."></textarea>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={() => setModalReactivar(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.refresh} Reactivar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {panelNuevo && <>
        <div className="side-panel-backdrop" onClick={cerrarPanelLead}/>
        <div className="side-panel" style={{width:'min(640px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Registro de lead</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{editandoLead ? 'Editar lead' : 'Nuevo lead'}</div>
              {editandoLeadConvertido && (
                <div className="lead-converted-note">
                  <div className="lead-converted-note-title">Este lead ya fue convertido. La ficha del lead queda como registro de origen.</div>
                  <div>Los datos bloqueados se actualizan desde:</div>
                  <div className="lead-converted-note-grid">
                    <span>Cuenta y empresa</span><strong>Cuentas y Contactos</strong>
                    <span>Contacto</span><strong>Ficha de la cuenta, seccion Contactos</strong>
                    <span>Monto y moneda</span><strong>{editState.montoBloqueado ? 'Cotizacion vinculada' : 'Oportunidad vinculada / Pipeline'}</strong>
                    <span>Datos comerciales</span><strong>Ficha de Oportunidad / Pipeline</strong>
                  </div>
                  <div className="lead-converted-note-muted">Algunos datos permanecen bloqueados para conservar trazabilidad del origen comercial.</div>
                </div>
              )}
            </div>
            <button className="icon-btn" onClick={cerrarPanelLead}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarLead}>
            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos del contacto</div>
            {campoBloqueadoConvertido && <div className="lead-section-lock-note">Se actualiza desde la ficha de la cuenta, seccion Contactos.</div>}
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Nombre del contacto * {campoBloqueadoConvertido && <LockHint>Ficha de cuenta / Contactos</LockHint>}</label>
                <input className={'input'+(errores.nombre?' border-danger':'')} value={formNuevo.nombre} onChange={e=>updateNuevo('nombre',e.target.value)} placeholder="Ej: Carlos Huanca" autoFocus={!campoBloqueadoConvertido} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/>
                {errores.nombre && <span style={{fontSize:11,color:'var(--danger)'}}>Campo requerido</span>}
              </div>
              <div className="input-group"><label>Cargo {campoBloqueadoConvertido && <LockHint>Ficha de cuenta / Contactos</LockHint>}</label><input className="input" value={formNuevo.cargo} onChange={e=>updateNuevo('cargo',e.target.value)} placeholder="Ej: Jefe de Mantenimiento" disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/></div>
              <div className="input-group">
                <label>Teléfono</label>
                {campoBloqueadoConvertido && <LockHint>Ficha de cuenta / Contactos</LockHint>}
                <input className={'input'+(errores.telefono?' border-danger':'')} type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={formNuevo.telefono} onChange={e=>updateNuevo('telefono',sanitizePhone(e.target.value))} placeholder="9XXXXXXXX" disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/>
                {errores.telefono && <span style={{fontSize:11,color:'var(--danger)'}}>{errores.telefono}</span>}
              </div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Email {campoBloqueadoConvertido && <LockHint>Ficha de cuenta / Contactos</LockHint>}</label><input className="input" type="email" value={formNuevo.email} onChange={e=>updateNuevo('email',e.target.value)} placeholder="contacto@empresa.pe" disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos de la empresa</div>
            {campoBloqueadoConvertido && <div className="lead-section-lock-note">Se actualiza desde Cuentas y Contactos.</div>}
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group">
                <label>Nombre comercial * {campoBloqueadoConvertido && <LockHint>Cuentas y Contactos</LockHint>}</label>
                <input className={'input'+(errores.empresa_contacto?' border-danger':'')} value={formNuevo.empresa_contacto} onChange={e=>updateNuevo('empresa_contacto',e.target.value)} placeholder="Ej: Minera San Cristóbal SAC" disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/>
                {errores.empresa_contacto && <span style={{fontSize:11,color:'var(--danger)'}}>Campo requerido</span>}
              </div>
              <div className="input-group"><label>Razón social legal</label><input className="input" value={formNuevo.razon_social} onChange={e=>updateNuevo('razon_social',e.target.value)} placeholder="Si difiere del nombre comercial" disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/></div>
              <div className="input-group">
                <label>RUC <span style={{fontSize:11,color:'var(--fg-subtle)',fontWeight:400}}>· 11 dígitos</span></label>
                {campoBloqueadoConvertido && <LockHint>Cuentas y Contactos</LockHint>}
                <input className={'input'+(errores.ruc?' border-danger':'')} value={formNuevo.ruc} onChange={e=>updateNuevo('ruc',sanitizeRuc(e.target.value))} placeholder="20xxxxxxxxx" inputMode="numeric" pattern={RUC_PATTERN} maxLength={11} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/>
                {errores.ruc && <span style={{fontSize:11,color:'var(--danger)'}}>{errores.ruc}</span>}
              </div>
              <div className="input-group"><label>Industria {campoBloqueadoConvertido && <LockHint>Cuentas y Contactos</LockHint>}</label><select className="select" value={formNuevo.industria} onChange={e=>updateNuevo('industria',e.target.value)} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}>
                <option value="">Seleccionar...</option>
                {['Mineria','Industrial','Construccion','Agroindustria','Facilities','Energia','Petroleo & Gas','Logistica','Retail','Salud','Educacion','Tecnologia','Servicios profesionales','Sector publico','Otro'].map(i=><option key={i}>{i}</option>)}
              </select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Oportunidad</div>
            {campoBloqueadoConvertido && <div className="lead-section-lock-note">Se actualiza desde la ficha de Oportunidad en Pipeline. Monto y moneda dependen de la cotizacion u oportunidad vinculada.</div>}
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Necesidad / Descripción</label><textarea className="input" rows={2} value={formNuevo.necesidad} onChange={e=>updateNuevo('necesidad',e.target.value)} placeholder="Ej: Mantenimiento de fajas transportadoras, 3 unidades con desgaste crítico" disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Servicio de interés <span style={{fontSize:11,color:'var(--fg-subtle)',fontWeight:400}}>· opcional</span></label>
                <select className="select" value={formNuevo.servicio_interes} onChange={e=>updateNuevo('servicio_interes',e.target.value)} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}>
                  <option value="">{loadingServiciosCatalogo ? 'Cargando servicios...' : 'Sin especificar'}</option>
                  {serviciosCatalogo.map(s=><option key={s.id || s.codigo} value={s.descripcion}>{s.descripcion}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Presupuesto estimado {motivoBloqueoMonto && <LockHint>{motivoBloqueoMonto}</LockHint>}</label>
                <input className="input" type="number" min="0" step="0.01" value={formNuevo.presupuesto_estimado} onChange={e=>updateNuevo('presupuesto_estimado',e.target.value)} placeholder="0" disabled={montoBloqueado} style={estiloBloqueado(montoBloqueado)}/>
              </div>
              <div className="input-group">
                <label>Moneda {motivoBloqueoMonto && <LockHint>{motivoBloqueoMonto}</LockHint>}</label>
                <select className="select" value={formNuevo.moneda} onChange={e=>updateNuevo('moneda',e.target.value)} disabled={montoBloqueado} style={estiloBloqueado(montoBloqueado)}>
                  {monedasActivas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>)}
                </select>
              </div>
              <div className="input-group"><label>Urgencia</label><select className="select" value={formNuevo.urgencia} onChange={e=>updateNuevo('urgencia',e.target.value)}>
                <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
              </select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Asignación</div>
            {campoBloqueadoConvertido && <div className="lead-section-lock-note">Los datos de origen permanecen bloqueados para conservar trazabilidad.</div>}
            <div className="grid-2" style={{gap:14, marginBottom:24}}>
              <div className="input-group">
                <label>Responsable comercial * {campoBloqueadoConvertido && <LockHint>Ficha de Oportunidad / Pipeline</LockHint>}</label>
                <select className={'select'+(errores.responsable?' border-danger':'')} value={formNuevo.responsable_id} onChange={e=>updateResponsableNuevo(e.target.value)} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}>
                  <option value="">Seleccionar...</option>
                  {comercialesAsignables.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                {errores.responsable && <span style={{fontSize:11,color:'var(--danger)'}}>Campo requerido</span>}
              </div>
              <div className="input-group"><label>Fuente {campoBloqueadoConvertido && <LockHint>Trazabilidad del lead</LockHint>}</label><select className="select" value={formNuevo.fuente} onChange={e=>updateNuevo('fuente',e.target.value)} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}>
                <option value="">Seleccionar...</option>
                {['Referido','Formulario web','LinkedIn','Evento / Feria','Cold outreach','Manual'].map(f=><option key={f}>{f}</option>)}
              </select></div>
              <div className="input-group">
                <label>Campaña de origen{loadingCampanasForm && <span className="text-muted" style={{fontWeight:400,marginLeft:6,fontSize:11}}>cargando…</span>}</label>
                {campoBloqueadoConvertido && <LockHint>Trazabilidad del lead</LockHint>}
                <select className="select" value={formNuevo.campana_id} onChange={e=>updateNuevo('campana_id',e.target.value)} disabled={loadingCampanasForm || campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}>
                  <option value="">Sin campaña (orgánico / referido)</option>
                  {campanasForm.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="input-group"><label>Registrado desde {campoBloqueadoConvertido && <LockHint>Trazabilidad del lead</LockHint>}</label><select className="select" value={formNuevo.registrado_desde} onChange={e=>updateNuevo('registrado_desde',e.target.value)} disabled={campoBloqueadoConvertido} style={estiloBloqueado(campoBloqueadoConvertido)}>
                <option value="web">Web / CRM</option><option value="campo">Campo (app móvil)</option>
              </select></div>
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={cerrarPanelLead}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{editandoLead ? I.save : I.plus} {editandoLead ? 'Guardar cambios' : 'Registrar lead'}</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}

// ============ PIPELINE ============
function Pipeline() {
  const {
    oportunidades, cuentas, actividades, agendaEventos, hojasCosteo, cotizaciones, osClientes,
    oppHistorialEtapas, personalAdmin,
    crearAgendaEvento, crearOportunidad, actualizarEtapaOportunidad, marcarGanada, marcarPerdida,
    actualizarAcuerdoComision, enviarAcuerdoAAprobacion, retirarAcuerdoComision, aprobarAcuerdoComision, rechazarAcuerdoComision, obtenerHistorialAcuerdo,
    navigate, activeParams, searchQuery, usuarios, roles, role, empresa, monedasActivas, authUser,
    probabilidadPorEtapaOpp, forecastPorEtapaOpp
  } = useApp();
  const [view, setView] = useState('kanban');
  const [showFiltrosPipeline, setShowFiltrosPipeline] = useState(false);
  const [filterPipeEtapa, setFilterPipeEtapa] = useState('');
  const [filterPipeResponsable, setFilterPipeResponsable] = useState('');
  const [filterPipeCuenta, setFilterPipeCuenta] = useState('');
  const [filterPipeMontoMin, setFilterPipeMontoMin] = useState('');
  const [filterPipeMontoMax, setFilterPipeMontoMax] = useState('');
  const [filterPipeCierreDesde, setFilterPipeCierreDesde] = useState('');
  const [filterPipeCierreHasta, setFilterPipeCierreHasta] = useState('');
  const [sel, setSel] = useState(null);
  const [oppDetailTab, setOppDetailTab] = useState('Resumen');
  const [agendaOpp, setAgendaOpp] = useState(null);
  const [panelNuevaOpp, setPanelNuevaOpp] = useState(false);
  const [pendingPerdida, setPendingPerdida] = useState(null);
  // Estado local del bloque de comisión (edición en curso)
  const [acuerdoEdit, setAcuerdoEdit] = useState(null); // { pct, bonificacion, justificacion }
  const [acuerdoRechazandoMotivo, setAcuerdoRechazandoMotivo] = useState('');
  const [acuerdoRechazandoId, setAcuerdoRechazandoId] = useState(null);
  const [acuerdoAprobandoEdit, setAcuerdoAprobandoEdit] = useState(null); // { pct, bonificacion } ajustables al aprobar
  const [acuerdoHistorial, setAcuerdoHistorial] = useState([]);
  const [showHistorial, setShowHistorial] = useState(false);
  const [acuerdoHistorialCargando, setAcuerdoHistorialCargando] = useState(false);
  const [motivoPerdida, setMotivoPerdida] = useState('');
  const [motivoError, setMotivoError] = useState(false);
  const [dropMsg, setDropMsg] = useState(null);
  const [serviciosOpp, setServiciosOpp] = useState([]);
  const [loadingServiciosOpp, setLoadingServiciosOpp] = useState(false);
  const comercialesAsignables = getAssignableUsers({ users: usuarios, roles, categories: ['comercial'], includeAdmins: true, empresaId: empresa?.id, viewer: authUser });
  const cuentasVisibles = cuentas.filter(c => canUserSeeOwner({ viewer: authUser, ownerUserId: c.responsable_id, ownerName: c.responsable_comercial, users: usuarios, roles }));
  const oppFormBase = {
    nombre: '',
    cuenta_id: '',
    servicio_id: '',
    servicio_interes: '',
    monto_estimado: '',
    moneda: empresa?.moneda || 'PEN',
    responsable: '',
    responsable_id: '',
    fecha_cierre_estimada: '',
    fuente: '',
    notas: '',
  };
  const [oppForm, setOppForm] = useState(oppFormBase);
  const updateOppForm = (field, value) => setOppForm(prev => ({ ...prev, [field]: value }));
  const updateOppServicio = (servicioId) => {
    const srv = serviciosOpp.find(s => String(s.id || s.codigo) === String(servicioId));
    setOppForm(prev => ({
      ...prev,
      servicio_id: servicioId,
      servicio_interes: srv?.descripcion || '',
      monto_estimado: prev.monto_estimado || (srv?.precio != null ? String(srv.precio) : ''),
      moneda: srv?.moneda || prev.moneda || 'PEN',
    }));
  };
  const updateOppResponsable = (userId) => {
    const user = comercialesAsignables.find(u => u.id === userId);
    setOppForm(prev => ({ ...prev, responsable_id: user?.id || '', responsable: user?.nombre || '' }));
  };
  const updateOppCuenta = (cuentaId) => {
    const cuenta = cuentasVisibles.find(c => c.id === cuentaId);
    setOppForm(prev => ({
      ...prev,
      cuenta_id: cuentaId,
      responsable_id: cuenta?.responsable_id || prev.responsable_id,
      responsable: cuenta?.responsable_comercial || prev.responsable,
    }));
  };
  const cerrarNuevaOpp = () => {
    setPanelNuevaOpp(false);
    setOppForm(oppFormBase);
  };
  const guardarNuevaOpp = (event) => {
    event.preventDefault();
    const etapaInicial = 'calificacion';
    const montoEstimado = Number(oppForm.monto_estimado || 0);
    const probabilidadInicial = probabilidadPorEtapaOpp(etapaInicial);
    crearOportunidad({
      cuenta_id: oppForm.cuenta_id || cuentas[0]?.id || null,
      nombre: oppForm.nombre || 'Nueva oportunidad',
      servicio_interes: oppForm.servicio_interes || oppForm.nombre || 'Servicio por definir',
      monto_estimado: montoEstimado,
      moneda: oppForm.moneda || 'PEN',
      responsable: oppForm.responsable || 'Por asignar',
      responsable_id: oppForm.responsable_id || null,
      fecha_cierre_estimada: oppForm.fecha_cierre_estimada || null,
      fuente: oppForm.fuente || null,
      notas: oppForm.notas || null,
      etapa: etapaInicial,
      probabilidad: probabilidadInicial,
      forecast_ponderado: forecastPorEtapaOpp({ monto_estimado: montoEstimado }, etapaInicial),
      fecha_creacion: new Date().toISOString().split('T')[0],
    });
    cerrarNuevaOpp();
  };

  useEffect(() => {
    if (activeParams?.panel) {
      const o = oportunidades.find(op => op.id === activeParams.panel);
      if (o) setSel(o);
    }
  }, [activeParams, oportunidades]);

  useEffect(() => {
    if (!sel?.id) return;
    const actualizada = oportunidades.find(o => o.id === sel.id);
    if (!actualizada) {
      setSel(null);
      return;
    }
    if (actualizada !== sel) setSel(actualizada);
  }, [oportunidades, sel?.id]);

  useEffect(() => {
    if (!panelNuevaOpp) return;
    if (isSupabaseConfigured() && empresa?.id) {
      setLoadingServiciosOpp(true);
      maestrosService.getServicios(empresa.id)
        .then(data => setServiciosOpp((data || []).filter(s => s.estado === 'activo')))
        .catch(() => setServiciosOpp((MOCK.servicios || []).filter(s => s.estado === 'activo')))
        .finally(() => setLoadingServiciosOpp(false));
    } else {
      setServiciosOpp((MOCK.servicios || []).filter(s => s.estado === 'activo'));
    }
  }, [panelNuevaOpp, empresa?.id]);

  useEffect(() => {
    if (oppDetailTab !== 'Comisión' || !sel?.id || !obtenerHistorialAcuerdo) return;
    setAcuerdoHistorial([]);
    setAcuerdoHistorialCargando(true);
    obtenerHistorialAcuerdo(sel.id)
      .then(rows => setAcuerdoHistorial(rows || []))
      .catch(() => setAcuerdoHistorial([]))
      .finally(() => setAcuerdoHistorialCargando(false));
  }, [oppDetailTab, sel?.id]);

  const cols = [
    { k: 'calificacion', title: 'Calificación', color: '#64748b', hint: 'Confirmaste necesidad, presupuesto y que tiene poder de decisión.' },
    { k: 'propuesta',    title: 'Propuesta',    color: '#06b6d4', hint: 'Le enviaste o presentaste una cotización formal. Esperas respuesta.' },
    { k: 'negociacion',  title: 'Negociación',  color: '#8b5cf6', hint: 'Hay interés confirmado. Están ajustando condiciones, precio o alcance.' },
    { k: 'ganada',       title: 'Ganada',       color: '#10b981', hint: 'Oportunidad cerrada. Se generará o ya existe una OS Cliente.' },
    { k: 'perdida',      title: 'Perdida',      color: '#f97316', hint: 'No se concretó. Registra el motivo para mejorar el proceso.' },
  ];
  
  const activeOps = oportunidades.filter(o => !['perdida'].includes(o.etapa));
  const query = searchQuery.toLowerCase();
  const getOppCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const filteredOps = oportunidades
    .filter(o => canUserSeeOwner({ viewer: authUser, ownerUserId: o.responsable_id, ownerName: o.responsable, users: usuarios, roles }))
    .filter(o =>
      o.nombre.toLowerCase().includes(query) ||
      getOppCuentaNombre(o.cuenta_id).toLowerCase().includes(query)
    )
    .filter(o => !filterPipeEtapa || o.etapa === filterPipeEtapa || (filterPipeEtapa === 'negociacion' && o.etapa === 'cierre'))
    .filter(o => !filterPipeResponsable || o.responsable_id === filterPipeResponsable)
    .filter(o => !filterPipeCuenta || o.cuenta_id === filterPipeCuenta)
    .filter(o => !filterPipeMontoMin || Number(o.monto_estimado || 0) >= Number(filterPipeMontoMin))
    .filter(o => !filterPipeMontoMax || Number(o.monto_estimado || 0) <= Number(filterPipeMontoMax))
    .filter(o => !filterPipeCierreDesde || (o.fecha_cierre_estimada || '') >= filterPipeCierreDesde)
    .filter(o => !filterPipeCierreHasta || (o.fecha_cierre_estimada || '') <= filterPipeCierreHasta);
  const etapaPipeline = (opp) => opp.etapa === 'cierre' ? 'negociacion' : opp.etapa;

  const getOppMontoCotizado = (oppId) => {
    const opp = oportunidades.find(o => o.id === oppId);
    const cot = getCotizacionAprobadaOpp(opp, cotizaciones);
    return cot ? { subtotal: Number(cot.subtotal ?? cot.subtotal_impl ?? cot.total_impl ?? cot.total ?? 0), moneda: cot.moneda || 'PEN' } : null;
  };
  const getOppMontoEfectivo = (o) => getOppMontoReal(o, cotizaciones).monto;

  const monedaBasePipeline = normalizeCurrencyCode(empresa?.moneda || empresa?.moneda_base || 'PEN');
  const sortPipelineCurrencyLines = lines => {
    const order = Array.from(new Set([monedaBasePipeline, 'PEN', 'USD', 'EUR']));
    return [...lines].sort((a, b) => {
      const ai = order.indexOf(a.moneda);
      const bi = order.indexOf(b.moneda);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.moneda.localeCompare(b.moneda);
    });
  };
  const sumPipelineByCurrency = (rows, getReal) => sortPipelineCurrencyLines(Object.entries(rows.reduce((acc, row) => {
    const real = getReal(row);
    acc[real.moneda] = (acc[real.moneda] || 0) + Number(real.monto || 0);
    return acc;
  }, {})).map(([moneda, monto]) => ({ moneda, monto })));
  const pipelineTotalLines = sumPipelineByCurrency(activeOps, o => getOppMontoReal(o, cotizaciones));
  const pipelineForecastLines = sumPipelineByCurrency(activeOps, o => getOppForecastReal(o, cotizaciones));
  const renderPipelineHeaderMoney = lines => {
    const rows = lines.length ? lines : [{ moneda: monedaBasePipeline, monto: 0 }];
    return (
      <strong style={{display:'inline-flex', flexDirection:'column', gap:2, lineHeight:1.15, verticalAlign:'top'}}>
        {rows.map(row => <span key={row.moneda}>{moneyCurrency(Math.round(row.monto), row.moneda)}</span>)}
      </strong>
    );
  };

  const ETAPAS_AUTO = ['propuesta', 'negociacion', 'ganada'];
  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (ETAPAS_AUTO.includes(targetStatus)) {
      setDropMsg('Esta etapa avanza automáticamente según el estado de la cotización.');
      setTimeout(() => setDropMsg(null), 4000);
      return;
    }
    if (targetStatus === 'perdida') { setPendingPerdida(id); setMotivoPerdida(''); setMotivoError(false); }
    else actualizarEtapaOportunidad(id, targetStatus);
  };

  const calculateDays = (dateStr) => {
    if(!dateStr) return 0;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getOppTimeline = (opp) => {
    if (!opp) return [];
    const oppId = opp.id;
    const items = [
      ...actividades
        .filter(a => a.oportunidad_id === oppId || (a.vinculo_tipo === 'oportunidad' && a.vinculo_id === oppId))
        .map(a => ({
          id: `act-${a.id}`,
          tipo: 'Actividad',
          titulo: a.descripcion,
          detalle: a.resultado || a.proxima_accion || a.estado,
          fecha: a.fecha,
          hora: a.hora,
          estado: a.estado,
          icon: I.check,
        })),
      ...agendaEventos
        .filter(e => e.oportunidad_id === oppId)
        .map(e => ({
          id: `evt-${e.id}`,
          tipo: 'Agenda',
          titulo: e.titulo,
          detalle: `${e.tipo} · ${e.vendedor || e.registrado_por || 'Sin asignar'}`,
          fecha: e.fecha,
          hora: e.hora,
          estado: e.estado,
          icon: I.calendar,
        })),
      ...hojasCosteo
        .filter(h => h.oportunidad_id === oppId)
        .map(h => ({
          id: `hc-${h.id}`,
          tipo: 'Hoja de Costeo',
          titulo: h.numero,
          detalle: `Costo ${money(h.costo_total || 0)} · sugerido ${money(h.precio_sugerido_total || 0)}`,
          fecha: h.fecha || h.created_at?.slice(0, 10),
          estado: h.estado,
          icon: I.receipt,
          action: () => navigate('hoja_costeo', { detail: h.id }),
        })),
      ...cotizaciones
        .filter(c => c.oportunidad_id === oppId)
        .map(c => ({
          id: `cot-${c.id}`,
          tipo: 'Cotizacion',
          titulo: c.numero,
          detalle: `${money(c.total || 0)} · v${c.version || 1}`,
          fecha: c.fecha || c.created_at?.slice(0, 10),
          estado: c.estado,
          icon: I.file,
          action: () => navigate('cotizaciones', { detail: c.id }),
        })),
      ...osClientes
        .filter(os => os.oportunidad_id === oppId)
        .map(os => ({
          id: `osc-${os.id}`,
          tipo: 'OS Cliente',
          titulo: os.numero,
          detalle: `${moneyCurrency(os.monto_aprobado || 0, os.moneda)} · ${os.estado}`,
          fecha: os.fecha_emision || os.created_at?.slice(0, 10),
          estado: os.estado,
          icon: I.file,
          action: () => navigate('os_cliente', { detail: os.id }),
        })),
      ...(oppHistorialEtapas || [])
        .filter(h => h.opp_id === oppId)
        .map(h => ({
          id: `etapa-${h.id}`,
          tipo: 'Etapa',
          titulo: `${h.etapa_desde} → ${h.etapa_hasta}`,
          detalle: h.usuario || '',
          fecha: h.fecha,
          icon: I.arrowUp,
        })),
    ];
    return items.sort((a, b) => {
      const ka = `${b.fecha || ''} ${b.hora || ''}`;
      const kb = `${a.fecha || ''} ${a.hora || ''}`;
      return ka.localeCompare(kb);
    });
  };
  const timelineSel = getOppTimeline(sel);
  const crearEventoDesdeOportunidad = (e) => {
    e.preventDefault();
    if (!agendaOpp) return;
    const fd = new FormData(e.target);
    crearAgendaEvento({
      titulo: fd.get('titulo'),
      tipo: fd.get('tipo') || 'reunion',
      cuenta_id: agendaOpp.cuenta_id || null,
      lead_id: agendaOpp.lead_id || agendaOpp.lead_origen || null,
      oportunidad_id: agendaOpp.id,
      vendedor: agendaOpp.responsable || 'Por asignar',
      registrado_por: agendaOpp.responsable || 'Por asignar',
      fecha: fd.get('fecha'),
      hora: fd.get('hora'),
      duracion_minutos: Number(fd.get('duracion_minutos') || 60),
      estado: 'programado',
      notas: fd.get('notas') || null,
    });
    setAgendaOpp(null);
    setSel(agendaOpp);
  };

  return (
    <>
      {dropMsg && (
        <div style={{position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', zIndex:9999, background:'#1e293b', color:'#fff', padding:'14px 20px', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.25)', fontSize:14, maxWidth:480, textAlign:'center', lineHeight:1.5, display:'flex', alignItems:'flex-start', gap:10}}>
          <span style={{fontSize:18, flexShrink:0}}>⚠️</span>
          <span>{dropMsg}</span>
          <button onClick={() => setDropMsg(null)} style={{background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:18, lineHeight:1, flexShrink:0, padding:0, marginLeft:4}}>×</button>
        </div>
      )}
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Pipeline</h1>
          <div className="page-sub" style={{marginTop:4, display:'flex', alignItems:'center', gap:10}}>
            <span>{activeOps.length} oportunidad{activeOps.length !== 1 ? 'es' : ''}</span>
            <span style={{width:4, height:4, borderRadius:99, background:'var(--border)'}}/>
            <span>Pipeline total {renderPipelineHeaderMoney(pipelineTotalLines)}</span>
            <span style={{width:4, height:4, borderRadius:99, background:'var(--border)'}}/>
            <span>Forecast {renderPipelineHeaderMoney(pipelineForecastLines)}</span>
            <span style={{color:'var(--fg-subtle)', cursor:'help'}} title="Calculado en base a probabilidad por etapa">{I.info}</span>
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className={`btn ${showFiltrosPipeline ? 'btn-primary' : 'btn-secondary'}`} style={{padding:'8px 16px', borderRadius:8}} onClick={() => setShowFiltrosPipeline(f => !f)}>{I.filter} Filtros{(filterPipeEtapa||filterPipeResponsable||filterPipeCuenta||filterPipeMontoMin||filterPipeMontoMax||filterPipeCierreDesde||filterPipeCierreHasta) ? ' •' : ''}</button>
          <div className="row" style={{background:'var(--green)', borderRadius:8, overflow:'hidden'}}>
            <button className="btn btn-primary" data-local-form="true" onClick={() => setPanelNuevaOpp(true)} style={{background:'transparent', border:'none', padding:'8px 16px', borderRight:'1px solid rgba(255,255,255,0.1)'}}>{I.plus} Nueva oportunidad</button>
            <button className="btn btn-primary" data-local-form="true" style={{background:'transparent', border:'none', padding:'8px 10px'}}>{I.chev}</button>
          </div>
        </div>
      </div>

      {showFiltrosPipeline && (
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
            <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterPipeEtapa} onChange={e => setFilterPipeEtapa(e.target.value)}>
              <option value="">Todas las etapas</option>
              <option value="calificacion">Calificación</option>
              <option value="propuesta">Propuesta</option>
              <option value="negociacion">Negociación</option>
              <option value="ganada">Ganada</option>
              <option value="perdida">Perdida</option>
            </select>
            <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterPipeResponsable} onChange={e => setFilterPipeResponsable(e.target.value)}>
              <option value="">Todos los responsables</option>
              {comercialesAsignables.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <select className="select" style={{flex:'1 1 180px', minWidth:160}} value={filterPipeCuenta} onChange={e => setFilterPipeCuenta(e.target.value)}>
              <option value="">Todas las cuentas</option>
              {cuentasVisibles.map(c => <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>)}
            </select>
            <input type="number" className="input" style={{flex:'1 1 120px', minWidth:100}} placeholder="Monto mín." value={filterPipeMontoMin} onChange={e => setFilterPipeMontoMin(e.target.value)}/>
            <input type="number" className="input" style={{flex:'1 1 120px', minWidth:100}} placeholder="Monto máx." value={filterPipeMontoMax} onChange={e => setFilterPipeMontoMax(e.target.value)}/>
            <input type="date" className="input" style={{flex:'1 1 140px', minWidth:120}} value={filterPipeCierreDesde} onChange={e => setFilterPipeCierreDesde(e.target.value)} title="Cierre estimado desde"/>
            <input type="date" className="input" style={{flex:'1 1 140px', minWidth:120}} value={filterPipeCierreHasta} onChange={e => setFilterPipeCierreHasta(e.target.value)} title="Cierre estimado hasta"/>
            {(filterPipeEtapa||filterPipeResponsable||filterPipeCuenta||filterPipeMontoMin||filterPipeMontoMax||filterPipeCierreDesde||filterPipeCierreHasta) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterPipeEtapa(''); setFilterPipeResponsable(''); setFilterPipeCuenta(''); setFilterPipeMontoMin(''); setFilterPipeMontoMax(''); setFilterPipeCierreDesde(''); setFilterPipeCierreHasta(''); }}>{I.x} Limpiar</button>
            )}
          </div>
        </div>
      )}

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(5, 1fr)'}}>
        {cols.map((c, i) => {
          const ops = filteredOps.filter(o => etapaPipeline(o) === c.k);
          const sumPEN = ops.reduce((s,o) => { const real = getOppMontoReal(o, cotizaciones); return real.moneda !== 'USD' ? s + real.monto : s; }, 0);
          const sumUSD = ops.reduce((s,o) => { const real = getOppMontoReal(o, cotizaciones); return real.moneda === 'USD' ? s + real.monto : s; }, 0);
          const icons = [I.star, I.file, I.hand, I.check, I.x];
          return (
            <div key={c.k} className={`pipeline-kpi-card ${c.k} hover-raise`} style={{ '--accent': c.color }}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>
                {icons[i]}
              </div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div style={{display:'flex', flexDirection:'column', gap:2}}>
                <div className="pipeline-kpi-value" style={{fontSize:'0.95em'}}>{money(sumPEN)}</div>
                <div className="pipeline-kpi-value" style={{fontSize:'0.95em'}}>{money(sumUSD, 'US$')}</div>
              </div>
              <div className="pipeline-kpi-count">{ops.length} oportunidad{ops.length !== 1 ? 'es' : ''}</div>
              <p style={{fontSize:'0.7rem', color:'var(--color-slate)', fontStyle:'italic', marginTop:'6px', lineHeight:'1.3'}}>{c.hint}</p>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20}}>
          <div className="kanban-v2">
            {cols.map(c => {
              const list = filteredOps
                .filter(o => etapaPipeline(o) === c.k)
                .sort((a, b) => (b.moved_at || 0) - (a.moved_at || 0) || (b.fecha_creacion || '').localeCompare(a.fecha_creacion || ''));
              const isAuto = ETAPAS_AUTO.includes(c.k);
              return (
                <div
                  key={c.k}
                  className="kanban-col-v2"
                  onDragOver={(e) => { if (!isAuto) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2" style={{display:'flex', alignItems:'center', gap:6}}>
                      {c.title}
                      {isAuto && <span style={{fontSize:9, color:'var(--text-muted)', fontWeight:400, letterSpacing:0.5}}>AUTO</span>}
                    </div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>

                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(o => (
                        <div
                          key={o.id}
                          className="kanban-card-v2"
                          draggable={!isAuto}
                          onDragStart={(e) => { if (!isAuto) startKanbanDrag(e, o.id); }}
                          onDragEnd={endKanbanDrag}
                          onClick={() => setSel(o)}
                          style={{cursor: 'pointer', ...(o.acuerdo_estado === 'pendiente' ? {borderLeft: '3px solid var(--orange)'} : {})}}
                        >
                          {o.acuerdo_estado === 'pendiente' && (
                            <div style={{display:'inline-flex', alignItems:'center', gap:4, background:'rgba(234,88,12,0.1)', color:'var(--orange)', border:'1px solid var(--orange)', borderRadius:999, fontSize:9, fontWeight:700, padding:'2px 8px', marginBottom:8}}>
                              ● Comisión pendiente de aprobación
                            </div>
                          )}
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:10, lineHeight:1.4}}>
                            {o.nombre}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:10}}>
                            {getOppCuentaNombre(o.cuenta_id)}
                          </div>
                          
                          <div style={{fontSize:14, fontWeight:800, color:'var(--navy)', marginBottom:12}}>
                            {(() => { const real = getOppMontoReal(o, cotizaciones); return moneyCurrency(real.monto, real.moneda); })()}
                          </div>
  
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <div className="badge badge-cyan" style={{fontSize:10, padding:'2px 8px'}}>{c.title}</div>
                              <div className="text-muted" style={{fontSize:10}}>{o.fecha_cierre_estimada || '12 may 2024'}</div>
                            </div>
                            <div className="avatar" style={{width:24, height:24, fontSize:10, margin:0, background:'var(--navy)', color:'#fff'}}>
                              {o.responsable?.charAt(0) || 'CR'}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.5}}>{[I.users, I.star, I.file, I.hand, I.check][cols.findIndex(col => col.k === c.k)]}</div>
                        <p>Aún no hay oportunidades<br/><span style={{fontSize:10}}>Las oportunidades nuevas aparecerán aquí.</span></p>
                      </div>
                    )}
                  </div>
  
                  <button className="kanban-btn-add">
                    {I.plus} Agregar oportunidad
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Oportunidad</th>
                  <th>Cuenta</th>
                  <th>Monto</th>
                  <th>Etapa</th>
                  <th>Prob.</th>
                  <th>Cierre</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {filteredOps.map(o => (
                  <tr key={o.id} className="hover-row" onClick={() => setSel(o)}>
                    <td style={{fontWeight:600}}>{o.nombre}</td>
                    <td>{getOppCuentaNombre(o.cuenta_id)}</td>
                    <td><strong>{(() => { const real = getOppMontoReal(o, cotizaciones); return moneyCurrency(real.monto, real.moneda); })()}</strong></td>
                    <td><span className="badge badge-cyan">{(o.etapa || '').toUpperCase()}</span></td>
                    <td>{getOppProbabilidadReal(o)}%</td>
                    <td className="text-muted">{o.fecha_cierre_estimada}</td>
                    <td>{o.responsable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && (() => {
        const etapaMap = {
          calificacion: { bg:'rgba(100,116,139,0.12)', color:'#64748b',          label:'Calificación' },
          prospeccion:  { bg:'rgba(100,116,139,0.12)', color:'#64748b',          label:'Prospección' },
          propuesta:    { bg:'var(--cyan-lt)',          color:'var(--cyan-dk)',   label:'Propuesta' },
          negociacion:  { bg:'var(--purple-lt)',        color:'var(--purple-dk)', label:'Negociación' },
          cierre:       { bg:'var(--green-lt)',         color:'var(--green-dk)', label:'Cierre' },
          ganada:       { bg:'var(--green-lt)',         color:'var(--green-dk)', label:'Ganada' },
          perdida:      { bg:'var(--orange-lt)',        color:'var(--orange-dk)', label:'Perdida' },
        };
        const ec = etapaMap[sel.etapa] || { bg:'var(--border)', color:'var(--fg-muted)', label: sel.etapa };
        const prob = Math.min(100, Math.max(0, getOppProbabilidadReal(sel)));
        const cotOpps = cotizaciones.filter(c => c.oportunidad_id === sel.id);
        const hojaOpps = hojasCosteo.filter(h => h.oportunidad_id === sel.id);
        const osExistente = osClientes.find(o => o.oportunidad_id === sel.id);
        const cotAprobada = cotOpps.find(c => c.estado === 'aprobada');
        const montoCotizado = getOppMontoCotizado(sel.id);
        const montoRealSel = getOppMontoReal(sel, cotizaciones);
        const montoDisplay = moneyCurrency(montoRealSel.monto, montoRealSel.moneda);
        const actividadCount = timelineSel.filter(t => ['Actividad','Agenda'].includes(t.tipo)).length;
        const oppHealthBase = [
          sel.cuenta_id ? 10 : 0,
          sel.responsable ? 10 : 0,
          sel.servicio_interes ? 10 : 0,
          Number(sel.monto_estimado || 0) > 0 || montoCotizado ? 10 : 0,
          sel.fecha_cierre_estimada ? 5 : 0,
          cotOpps.length ? 20 : 0,
          actividadCount ? 10 : 0,
          hojaOpps.length ? 10 : 0,
          osExistente ? 15 : 0,
        ].reduce((sum, value) => sum + value, 0);
        const oppHealthScore = Math.max(0, Math.min(100, Math.round(Math.max(prob, oppHealthBase))));
        const oppHealthColor = oppHealthScore >= 70 ? 'var(--green)' : oppHealthScore >= 40 ? 'var(--orange)' : 'var(--cyan)';
        const oppHealthBg = oppHealthScore >= 70 ? 'rgba(16,185,129,0.08)' : oppHealthScore >= 40 ? 'rgba(249,115,22,0.08)' : 'rgba(6,182,212,0.08)';
        const oppHealthLabel = oppHealthScore >= 70 ? 'Alta probabilidad' : oppHealthScore >= 40 ? 'En desarrollo' : 'Inicio comercial';
        const oppCriterios = [
          { ok: !!sel.cuenta_id, text: 'Cuenta vinculada' },
          { ok: !!sel.responsable, text: sel.responsable ? 'Responsable asignado' : 'Responsable pendiente' },
          { ok: !!sel.servicio_interes, text: 'Servicio definido' },
          { ok: cotOpps.length > 0, text: cotOpps.length ? `${cotOpps.length} cotizacion(es)` : 'Sin cotizacion' },
          { ok: actividadCount > 0, text: actividadCount ? `${actividadCount} actividad(es)` : 'Sin actividad registrada' },
          { ok: !!sel.fecha_cierre_estimada, text: sel.fecha_cierre_estimada ? 'Fecha de cierre estimada' : 'Sin fecha de cierre' },
        ];
        const infoRows = [
          { icon: I.building, label: 'Cuenta',            value: getOppCuentaNombre(sel.cuenta_id) },
          { icon: I.users,    label: 'Responsable',       value: sel.responsable || 'Por asignar' },
          { icon: I.target,   label: 'Servicio de interés', value: sel.servicio_interes },
          { icon: I.send,     label: 'Fuente',            value: sel.fuente },
        ].filter(r => r.value);

        // ── Comisión ──────────────────────────────────────────────────────
        // Lookup de dos pasos: usuario → ficha administrativa
        // El nombre en usuarios puede ser el email-fallback (ej: "camilo.sinche") si no hay user_metadata.nombre,
        // mientras que personal_administrativo.nombre es el nombre completo ("Camilo Sinche").
        // Por eso priorizamos: auth_user_id → email → nombre.
        const _normNombre = s => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const _normEmail = s => (s || '').trim().toLowerCase();
        const vendedorUsuario = usuarios.find(u =>
          u.id === sel.responsable_id ||
          u.auth_user_id === sel.responsable_id ||
          _normNombre(u.nombre) === _normNombre(sel.responsable)
        );
        const vendedorPersonal = personalAdmin.find(p =>
          (vendedorUsuario?.auth_user_id && p.auth_user_id === vendedorUsuario.auth_user_id) ||
          (vendedorUsuario?.email && p.email && _normEmail(p.email) === _normEmail(vendedorUsuario.email)) ||
          p.id === sel.responsable_id ||
          p.auth_user_id === sel.responsable_id ||
          _normNombre(p.nombre) === _normNombre(sel.responsable) ||
          (p.nombre_completo && _normNombre(p.nombre_completo) === _normNombre(sel.responsable))
        );
const pctBase = vendedorPersonal?.porcentaje_comision !== null && vendedorPersonal?.porcentaje_comision !== undefined
          ? Number(vendedorPersonal.porcentaje_comision)
          : null;
        const monedaSimbolo = sel.moneda === 'USD' ? 'US$' : 'S/';

        const acuerdoOpp = {
          estado: sel.acuerdo_estado || 'sin_acuerdo',
          pct: sel.acuerdo_pct,
          bonificacion: sel.acuerdo_bonificacion ?? 0,
          justificacion: sel.acuerdo_justificacion || '',
          aprobado_por: sel.acuerdo_aprobado_por || '',
          fecha_aprobacion: sel.acuerdo_fecha_aprobacion || '',
          motivo_rechazo: sel.acuerdo_motivo_rechazo || '',
        };

        // Calcular si el acuerdo requiere aprobación
        const pctPropuesto = acuerdoEdit?.pct !== undefined ? Number(acuerdoEdit.pct) : (acuerdoOpp.pct !== null && acuerdoOpp.pct !== undefined ? Number(acuerdoOpp.pct) : pctBase);
        const bonPropuesta = acuerdoEdit?.bonificacion !== undefined ? Number(acuerdoEdit.bonificacion) : Number(acuerdoOpp.bonificacion);
        const requiereAprobacion = bonPropuesta > 0 || (pctBase !== null ? pctPropuesto !== pctBase : pctPropuesto > 0);

        const estadoBadge = {
          sin_acuerdo: { label: 'Sin acuerdo especial', cls: 'badge-gray' },
          borrador:    { label: 'Borrador', cls: 'badge-gray' },
          pendiente:   { label: 'Pendiente de aprobación', cls: 'badge-orange' },
          aprobado:    { label: 'Aprobado', cls: 'badge-green' },
          rechazado:   { label: 'Rechazado', cls: 'badge-red' },
        };
        const eb = estadoBadge[acuerdoOpp.estado] || estadoBadge.sin_acuerdo;

        // Tab visible para cualquier rol de categoría comercial (regla global de plataforma) o admin
        const esRolComercial = getUserCategory(authUser, roles) === 'comercial' || role?.categoria === 'comercial';
        const nivelJerarquico = getUserHierarchyLevel(authUser, roles);
        const puedeVerComision = esRolComercial || role?.permisos?.ver_costos || role?.permisos?.todo;
        // Puede aprobar: admin, o rol comercial de nivel jefatura/supervisor/dirección
        const puedeAprobar = role?.permisos?.aprobar_descuentos || role?.permisos?.tenant_admin || role?.permisos?.todo ||
          (esRolComercial && ['direccion', 'jefatura', 'supervisor'].includes(nivelJerarquico));
        // Es el vendedor responsable
        const esVendedorResponsable = authUser?.id && (
          sel.responsable_id === authUser.id ||
          vendedorPersonal?.auth_user_id === authUser.id
        );
        const cotizacionAprobada = Boolean(cotAprobada);
        // Solo la cotización aprobada bloquea edición; oportunidad ganada/perdida no debe bloquear
        const acuerdoCerrado = cotizacionAprobada;
        const puedeEditarAcuerdo = !acuerdoCerrado &&
          !['aprobado','pendiente'].includes(acuerdoOpp.estado) &&
          (esVendedorResponsable || puedeAprobar);
        const puedeModificarAcuerdoAprobado = acuerdoOpp.estado === 'aprobado' &&
          !acuerdoCerrado &&
          (esVendedorResponsable || puedeAprobar);
        // ──────────────────────────────────────────────────────────────────

        return (
          <>
            <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
            <div className="side-panel ficha-detail-panel" style={{width:'min(680px,96vw)'}}>

              <div className="side-panel-head" style={{alignItems:'flex-start', flexDirection:'column', gap:10}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', width:'100%'}}>
                  <div style={{minWidth:0}}>
                    <div className="eyebrow">Ficha de oportunidad</div>
                    <div className="font-display ficha-detail-title" style={{marginTop:4}}>{sel.nombre}</div>
                    <div className="row" style={{gap:8, marginTop:10, flexWrap:'wrap'}}>
                      <span className="badge" style={{background:ec.bg, color:ec.color}}>{ec.label}</span>
                      <span className="badge badge-gray">{prob}% probabilidad</span>
                      {sel.fecha_cierre_estimada && <span className="badge badge-cyan">Cierre {sel.fecha_cierre_estimada}</span>}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
                </div>
              </div>

              <div className="side-panel-body" style={{padding:0}}>
                <div style={{padding:'16px 22px 18px', borderBottom:'1px solid var(--border)', background:oppHealthBg}}>
                  <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:8}}>
                    <span className="ficha-detail-score" style={{color:oppHealthColor}}>{oppHealthScore}</span>
                    <span style={{fontSize:12, color:'var(--fg-muted)'}}>/ 100</span>
                    <span style={{fontSize:11, fontWeight:700, color:oppHealthColor, padding:'2px 10px', borderRadius:99, border:`1px solid ${oppHealthColor}`}}>Salud comercial</span>
                    <span style={{fontSize:12, color:'var(--fg-muted)'}}>{oppHealthLabel}</span>
                  </div>
                  <div style={{height:6, borderRadius:99, background:'var(--border)', overflow:'hidden', marginBottom:12}}>
                    <div style={{width:`${oppHealthScore}%`, height:'100%', borderRadius:99, background:oppHealthColor, transition:'width 0.4s'}}/>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 20px'}}>
                    {oppCriterios.map((c, i) => (
                      <div key={i} style={{display:'flex', alignItems:'center', gap:6}}>
                        <span style={{width:14, height:14, flex:'0 0 14px', display:'inline-flex', alignItems:'center', justifyContent:'center', color:c.ok ? 'var(--green)' : 'var(--fg-muted)'}}>
                          {c.ok ? I.check : <span style={{fontSize:14, lineHeight:1}}>-</span>}
                        </span>
                        <span style={{fontSize:10.5, lineHeight:1.3, color:c.ok ? 'var(--fg)' : 'var(--fg-muted)'}}>{c.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ficha-detail-tabs" style={{padding:'0 22px', borderBottom:'1px solid var(--border)', display:'flex', gap:4, flexWrap:'wrap'}}>
                  {['Resumen', 'Timeline', 'Acciones', ...(puedeVerComision ? ['Comisión'] : [])].map(t => (
                    <button key={t} className={`ficha-detail-tab ${oppDetailTab===t?'active':''}`} onClick={() => setOppDetailTab(t)}>
                      {t === 'Comisión' && acuerdoOpp.estado === 'pendiente'
                        ? <>{t} <span style={{display:'inline-block', width:7, height:7, borderRadius:99, background:'var(--orange)', marginLeft:4, verticalAlign:'middle'}}/></>
                        : t}
                    </button>
                  ))}
                </div>
                <div className="ficha-detail-content">

                {oppDetailTab === 'Resumen' && (
                  <div className="col" style={{gap:16, padding:22}}>
                {/* Stats */}
                <div className="grid-3" style={{gap:10}}>
                  <div style={{background:'var(--bg-subtle)', borderRadius:10, padding:'12px 10px', border:'1px solid var(--border)', textAlign:'center'}}>
                    <div className="eyebrow" style={{marginBottom:5}}>Monto</div>
                    <div style={{fontFamily:'Sora,sans-serif', fontSize:16, fontWeight:700, color:'var(--cyan-dk)', lineHeight:1.2}}>{montoDisplay}</div>
                  </div>
                  <div style={{background:'var(--bg-subtle)', borderRadius:10, padding:'12px 10px', border:'1px solid var(--border)', textAlign:'center'}}>
                    <div className="eyebrow" style={{marginBottom:5}}>Prob.</div>
                    <div style={{fontFamily:'Sora,sans-serif', fontSize:16, fontWeight:700, lineHeight:1.2}}>{prob}%</div>
                    <div style={{height:3, background:'var(--border)', borderRadius:4, marginTop:7}}>
                      <div style={{height:3, borderRadius:4, background:'var(--cyan-dk)', width:`${prob}%`, transition:'width 0.4s'}}/>
                    </div>
                  </div>
                  <div style={{background:'var(--bg-subtle)', borderRadius:10, padding:'12px 10px', border:'1px solid var(--border)', textAlign:'center'}}>
                    <div className="eyebrow" style={{marginBottom:5}}>Cierre</div>
                    <div style={{fontSize:12, fontWeight:700, lineHeight:1.3}}>{sel.fecha_cierre_estimada || 'Sin fecha'}</div>
                  </div>
                </div>

                {/* Detalles */}
                <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
                  {infoRows.map((row, idx) => (
                    <div key={row.label} style={{display:'flex', alignItems:'flex-start', gap:10, padding:'9px 14px', borderBottom: idx < infoRows.length - 1 ? '1px solid var(--border)' : 'none', background: idx % 2 ? 'var(--bg-subtle)' : 'transparent'}}>
                      <span style={{width:15, height:15, flexShrink:0, color:'var(--fg-muted)', marginTop:2, opacity:0.7}}>{row.icon}</span>
                      <div>
                        <div className="eyebrow" style={{marginBottom:2}}>{row.label}</div>
                        <div style={{fontSize:13, fontWeight:500}}>{row.value}</div>
                      </div>
                    </div>
                  ))}
                  {sel.notas && (
                    <div style={{padding:'10px 14px', borderTop:'1px solid var(--border)', background: infoRows.length % 2 ? 'var(--bg-subtle)' : 'transparent'}}>
                      <div className="eyebrow" style={{marginBottom:4}}>Notas</div>
                      <div style={{fontSize:12, color:'var(--fg-muted)', lineHeight:1.6}}>{sel.notas}</div>
                    </div>
                  )}
                </div>

                {/* Acciones rápidas */}
                </div>
                )}

                {oppDetailTab === 'Acciones' && (
                  <div className="row" style={{gap:8, padding:'22px 22px 0'}}>
                  <button type="button" className="btn btn-secondary flex-1" style={{fontSize:12}} data-local-form="true"
                    onClick={e => { e.stopPropagation(); setAgendaOpp(sel); }}>
                    {I.calendar} Agendar
                  </button>
                  <button className="btn btn-secondary flex-1" style={{fontSize:12}} onClick={() => navigate('actividades')}>
                    {I.check} Actividades
                  </button>
                </div>
                )}

                {/* Timeline */}
                {oppDetailTab === 'Timeline' && (
                  <div style={{padding:22}}>
                <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'var(--bg-subtle)'}}>
                    <div>
                      <div className="eyebrow">Timeline Comercial</div>
                      <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:1}}>Agenda · Actividades · Costeo · Cotizaciones</div>
                    </div>
                    <span className="badge badge-cyan">{timelineSel.length}</span>
                  </div>
                  {timelineSel.length > 0 ? (
                    <div className="commercial-timeline-list" style={{borderRadius:0}}>
                      {timelineSel.map(item => (
                        <button key={item.id} type="button" className={`commercial-timeline-item ${item.action ? 'clickable' : ''}`} onClick={item.action || undefined}>
                          <span className="commercial-timeline-icon">{item.icon}</span>
                          <span className="commercial-timeline-body">
                            <span className="commercial-timeline-meta">{item.tipo} · {item.fecha || 'Sin fecha'} {item.hora || ''}</span>
                            <strong>{item.titulo}</strong>
                            {item.detalle && <span>{item.detalle}</span>}
                          </span>
                          {item.estado && <span className={'badge ' + (item.estado === 'completada' || item.estado === 'aprobada' || item.estado === 'ganada' || item.estado === 'realizado' ? 'badge-green' : item.estado === 'borrador' || item.estado === 'pendiente' ? 'badge-cyan' : 'badge-orange')}>{item.estado}</span>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{padding:'20px 14px', textAlign:'center', color:'var(--fg-muted)', fontSize:12}}>
                      Aún no hay historial comercial vinculado.
                    </div>
                  )}
                </div>
                  </div>
                )}

                {/* CTAs principales */}
                {oppDetailTab === 'Acciones' && (
                  <div className="col" style={{gap:8, padding:'0 22px 22px'}}>
                {!['ganada', 'perdida'].includes(sel.etapa) && (
                  <div className="col" style={{gap:8, paddingBottom:4}}>
                    {!cotizaciones.some(c => c.oportunidad_id === sel.id) && (
                      <button className="btn btn-primary" style={{justifyContent:'center', fontWeight:600}} data-local-form="true"
                        onClick={e => { e.stopPropagation(); navigate('cotizaciones', { opp: sel.id, active_tab: 'nueva' }); }}>
                        {I.file} Crear Cotización
                      </button>
                    )}
                    {!hojasCosteo.some(h => h.oportunidad_id === sel.id) && !cotizaciones.some(c => c.oportunidad_id === sel.id) && (
                      <button className="btn btn-secondary" style={{justifyContent:'center'}} data-local-form="true"
                        onClick={e => { e.stopPropagation(); navigate('hoja_costeo', { nueva: true, opp: sel.id }); }}>
                        {I.receipt} Crear Hoja de Costeo
                      </button>
                    )}
                    <div className="row" style={{gap:8, marginTop:2}}>
                      {sel.etapa === 'negociacion' && (
                        <button className="btn flex-1" style={{justifyContent:'center', background:'var(--green-lt)', color:'var(--green-dk)', border:'1px solid rgba(76,175,80,0.3)', fontWeight:600}}
                          onClick={() => { marcarGanada(sel.id, {}); setSel(null); }}>
                          {I.check} Ganar
                        </button>
                      )}
                      <button className="btn btn-ghost flex-1" style={{justifyContent:'center', color:'var(--danger)', opacity:0.75}}
                        onClick={() => { setPendingPerdida(sel.id); setMotivoPerdida(''); setMotivoError(false); }}>
                        Perder
                      </button>
                    </div>
                  </div>
                )}
                {sel.etapa === 'ganada' && (() => {
                  const osExistente = osClientes.find(o => o.oportunidad_id === sel.id);
                  if (osExistente) {
                    return (
                      <div className="col" style={{gap:8, paddingBottom:4}}>
                        <button className="btn btn-primary" style={{justifyContent:'center'}}
                          onClick={() => { setSel(null); navigate('os_cliente', { detail: osExistente.id }); }}>
                          {I.package} Ver OS Cliente — {osExistente.numero}
                        </button>
                      </div>
                    );
                  }
                  const cotAprobada = cotizaciones.find(c => c.oportunidad_id === sel.id && c.estado === 'aprobada');
                  if (cotAprobada) {
                    return (
                      <div className="col" style={{gap:8, paddingBottom:4}}>
                        <button className="btn btn-primary" style={{justifyContent:'center', background:'var(--green)', borderColor:'var(--green)'}}
                          onClick={() => { setSel(null); navigate('cotizaciones', { detail: cotAprobada.id, crear_os: true }); }}>
                          {I.clipboard} Crear OS Cliente
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
                  </div>
                )}

                {/* ── Tab: Comisión ─────────────────────────────────────── */}
                {oppDetailTab === 'Comisión' && puedeVerComision && (() => {
                  const editando = acuerdoEdit !== null;
                  const pctValor = editando ? (acuerdoEdit.pct ?? '') : (acuerdoOpp.pct ?? '');
                  const bonValor = editando ? (acuerdoEdit.bonificacion ?? 0) : acuerdoOpp.bonificacion;
                  const justValor = editando ? (acuerdoEdit.justificacion ?? '') : acuerdoOpp.justificacion;

                  const diffPct = pctBase !== null && pctValor !== '' && Number(pctValor) !== pctBase;
                  const hayBon = Number(bonValor) > 0;
                  const necesitaJustificacion = diffPct || hayBon;
                  const bloqueado = acuerdoOpp.estado === 'aprobado' && acuerdoCerrado;
                  const enPendiente = acuerdoOpp.estado === 'pendiente';

                  const guardarBorrador = () => {
                    if (!acuerdoEdit) return;
                    const pctRaw = acuerdoEdit.pct !== '' && acuerdoEdit.pct != null ? acuerdoEdit.pct : (acuerdoOpp.pct ?? pctBase ?? 0);
                    const pct = Number(pctRaw);
                    const bon = Number(acuerdoEdit.bonificacion ?? 0);
                    const justificacion = acuerdoEdit.justificacion || '';
                    const sinCambios = acuerdoOpp.estado === 'aprobado' &&
                      Number(acuerdoOpp.pct ?? pctBase ?? 0) === pct &&
                      Number(acuerdoOpp.bonificacion ?? 0) === bon &&
                      String(acuerdoOpp.justificacion || '') === String(justificacion || '');
                    if (sinCambios) {
                      setAcuerdoEdit(null);
                      return;
                    }
                    const esBaseConBon0 = pctBase !== null && pct === pctBase && bon === 0;
                    if (esBaseConBon0) {
                      const ahora = new Date().toISOString();
                      const patch = {
                        acuerdo_pct: pct,
                        acuerdo_bonificacion: bon,
                        acuerdo_justificacion: justificacion,
                        acuerdo_estado: 'aprobado',
                        acuerdo_aprobado_por: 'Automático',
                        acuerdo_fecha_aprobacion: ahora,
                      };
                      actualizarAcuerdoComision(sel.id, patch);
                      setSel(prev => ({ ...prev, ...patch }));
                    } else {
                      const patch = {
                        acuerdo_pct: pct,
                        acuerdo_bonificacion: bon,
                        acuerdo_justificacion: justificacion,
                        acuerdo_estado: 'borrador',
                        acuerdo_aprobado_por: null,
                        acuerdo_aprobado_id: null,
                        acuerdo_fecha_aprobacion: null,
                        acuerdo_motivo_rechazo: null,
                      };
                      actualizarAcuerdoComision(sel.id, patch);
                      setSel(prev => ({ ...prev, ...patch }));
                    }
                    setAcuerdoEdit(null);
                  };

                  return (
                    <div className="col" style={{gap:16, padding:22}}>
                      {/* Estado badge */}
                      <div style={{display:'flex', alignItems:'center', gap:10, justifyContent:'space-between'}}>
                        <div>
                          <div className="eyebrow" style={{marginBottom:4}}>Acuerdo de comisión</div>
                          <span className={`badge ${eb.cls}`}>{eb.label}</span>
                          {sel.responsable && (
                            <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:5}}>
                              Comisión base de <strong>{sel.responsable}</strong>:{' '}
                              {pctBase !== null ? `${pctBase}%` : <button className="btn btn-ghost" style={{ padding: 0, fontSize: 11, color: 'var(--cyan)', textDecoration: 'underline' }} onClick={() => navigate('rrhh_admin')}>sin datos — configurar en RRHH</button>}
                            </div>
                          )}
                        </div>
                        {acuerdoOpp.aprobado_por && (
                          <div style={{fontSize:11, color:'var(--fg-muted)', textAlign:'right'}}>
                            <div>Aprobado por <strong>{acuerdoOpp.aprobado_por}</strong></div>
                            <div>{acuerdoOpp.fecha_aprobacion ? new Date(acuerdoOpp.fecha_aprobacion).toLocaleDateString('es-PE') : ''}</div>
                          </div>
                        )}
                      </div>

                      {/* Motivo rechazo */}
                      {acuerdoOpp.estado === 'rechazado' && acuerdoOpp.motivo_rechazo && (
                        <div style={{background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--danger)'}}>
                          <strong>Motivo del rechazo:</strong> {acuerdoOpp.motivo_rechazo}
                        </div>
                      )}

                      {/* Aviso: acuerdo en proceso de aprobación */}
                      {enPendiente && !puedeAprobar && (
                        <div style={{background:'rgba(249,115,22,0.07)', border:'1px solid rgba(249,115,22,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#c2410c'}}>
                          Este acuerdo está en proceso de aprobación y no puede editarse hasta que sea resuelto.
                        </div>
                      )}

                      {/* Aviso: acuerdo aprobado y cotización cerrada */}
                      {bloqueado && (
                        <div style={{background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#059669'}}>
                          Este acuerdo ya fue aprobado y la cotización está cerrada. Contacta a tu supervisor para modificarlo.
                        </div>
                      )}

                      {/* Campos del acuerdo */}
                      <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
                        {/* % Comisión */}
                        <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)', background:'var(--bg-subtle)'}}>
                          <div className="eyebrow" style={{marginBottom:6}}>% Comisión acordada</div>
                          {editando && !bloqueado ? (
                            <>
                              <input
                                type="number" min="0" max="100" step="0.01"
                                className="input" style={{width:120}}
                                value={pctValor}
                                onChange={e => setAcuerdoEdit(prev => ({ ...prev, pct: e.target.value }))}
                              />
                              {pctBase !== null && (
                                <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>
                                  Tu comisión base es {pctBase}%
                                </div>
                              )}
                              {pctBase !== null && pctValor !== '' && (() => {
                                const pctNum = Number(pctValor);
                                if (pctNum === pctBase) return (
                                  <div style={{marginTop:6, padding:'6px 10px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:6, fontSize:11, color:'#059669', lineHeight:1.5}}>
                                    Este % coincide con tu comisión base ({pctBase}%). No requiere aprobación adicional.
                                  </div>
                                );
                                if (pctNum > pctBase) return (
                                  <div style={{marginTop:6, padding:'6px 10px', background:'rgba(249,115,22,0.1)', border:'1px solid rgba(249,115,22,0.3)', borderRadius:6, fontSize:11, color:'#c2410c', lineHeight:1.5}}>
                                    Tu comisión base es {pctBase}%. Estás proponiendo {pctValor}% — este acuerdo requerirá aprobación del Gerente Comercial o Admin.
                                  </div>
                                );
                                return (
                                  <div style={{marginTop:6, padding:'6px 10px', background:'rgba(6,182,212,0.1)', border:'1px solid rgba(6,182,212,0.3)', borderRadius:6, fontSize:11, color:'#0e7490', lineHeight:1.5}}>
                                    Tu comisión base es {pctBase}%. Estás proponiendo {pctValor}% que es menor a tu base.
                                  </div>
                                );
                              })()}
                            </>
                          ) : (
                            <div style={{fontSize:15, fontWeight:700, color:'var(--navy)'}}>
                              {pctValor !== '' ? `${pctValor}%` : (pctBase !== null ? `${pctBase}% (base)` : '—')}
                            </div>
                          )}
                        </div>

                        {/* Bonificación */}
                        <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)'}}>
                          <div className="eyebrow" style={{marginBottom:6}}>Bonificación fija ({monedaSimbolo})</div>
                          {editando && !bloqueado ? (
                            <>
                              <input
                                type="number" min="0" step="0.01"
                                className="input" style={{width:160}}
                                value={bonValor}
                                onChange={e => setAcuerdoEdit(prev => ({ ...prev, bonificacion: e.target.value }))}
                              />
                              {hayBon && (
                                <div style={{marginTop:6, padding:'6px 10px', background:'rgba(249,115,22,0.1)', border:'1px solid rgba(249,115,22,0.3)', borderRadius:6, fontSize:11, color:'#c2410c', lineHeight:1.5}}>
                                  Estás proponiendo una bonificación adicional de {monedaSimbolo} {Number(bonValor).toFixed(2)} — este acuerdo requerirá aprobación.
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{fontSize:15, fontWeight:700, color: hayBon ? 'var(--orange)' : 'var(--fg-muted)'}}>
                              {hayBon ? `${monedaSimbolo} ${Number(bonValor).toFixed(2)}` : '—'}
                            </div>
                          )}
                        </div>

                        {/* Justificación */}
                        <div style={{padding:'12px 14px'}}>
                          <div className="eyebrow" style={{marginBottom:6}}>
                            Justificación del acuerdo {necesitaJustificacion && <span style={{color:'var(--danger)'}}>*</span>}
                          </div>
                          {editando && !bloqueado ? (
                            <textarea
                              className="input" rows={3}
                              placeholder="Ej: Cliente estratégico con contrato multianual"
                              value={justValor}
                              onChange={e => setAcuerdoEdit(prev => ({ ...prev, justificacion: e.target.value }))}
                              style={{resize:'vertical'}}
                            />
                          ) : (
                            <div style={{fontSize:13, color: justValor ? 'var(--fg)' : 'var(--fg-muted)', fontStyle: justValor ? 'normal' : 'italic', lineHeight:1.6}}>
                              {justValor || 'Sin justificación'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botones según estado y rol */}
                      <div className="col" style={{gap:8}}>
                        {/* Edición: guardar borrador / cancelar */}
                        {editando && !bloqueado && (
                          <div className="row" style={{gap:8}}>
                            <button className="btn btn-primary flex-1" style={{justifyContent:'center'}} onClick={guardarBorrador}>
                              {I.check} Guardar borrador
                            </button>
                            <button className="btn btn-ghost flex-1" style={{justifyContent:'center'}} onClick={() => setAcuerdoEdit(null)}>
                              Cancelar
                            </button>
                          </div>
                        )}

                        {/* Vendedor en estado sin_acuerdo/borrador/rechazado: editar y enviar */}
                        {!editando && !bloqueado && ['sin_acuerdo','borrador','rechazado'].includes(acuerdoOpp.estado) && puedeEditarAcuerdo && (
                          <div className="row" style={{gap:8}}>
                            <button className="btn btn-secondary flex-1" style={{justifyContent:'center', fontSize:12}}
                              onClick={() => setAcuerdoEdit({
                                pct: acuerdoOpp.pct ?? pctBase ?? '',
                                bonificacion: acuerdoOpp.bonificacion ?? 0,
                                justificacion: acuerdoOpp.justificacion ?? '',
                              })}>
                              {I.edit || '✏️'} {acuerdoOpp.estado === 'sin_acuerdo' ? 'Proponer acuerdo' : acuerdoOpp.estado === 'rechazado' ? 'Corregir y reenviar' : 'Editar borrador'}
                            </button>
                            {requiereAprobacion && ['borrador','rechazado'].includes(acuerdoOpp.estado) && (
                              <button className="btn btn-primary flex-1" style={{justifyContent:'center', fontSize:12, background:'var(--orange)', borderColor:'var(--orange)'}}
                                onClick={() => enviarAcuerdoAAprobacion(sel.id)}>
                                Enviar a aprobación
                              </button>
                            )}
                          </div>
                        )}

                        {/* Vendedor en estado pendiente: info + retirar */}
                        {!editando && enPendiente && esVendedorResponsable && !puedeAprobar && (
                          <div className="col" style={{gap:8}}>
                            <div style={{fontSize:12, color:'var(--fg-muted)', fontStyle:'italic', textAlign:'center', padding:'4px 0'}}>
                              Esperando aprobación del Gerente Comercial
                            </div>
                            <button className="btn btn-ghost" style={{justifyContent:'center', fontSize:12, color:'var(--fg-muted)'}}
                              onClick={() => retirarAcuerdoComision(sel.id)}>
                              Retirar solicitud
                            </button>
                          </div>
                        )}

                        {/* Gerente en estado pendiente: aprobar / rechazar */}
                        {!editando && enPendiente && puedeAprobar && (() => {
                          if (acuerdoRechazandoId === sel.id) {
                            return (
                              <div className="col" style={{gap:8}}>
                                <textarea className="input" rows={2} placeholder="Motivo del rechazo (obligatorio)"
                                  value={acuerdoRechazandoMotivo}
                                  onChange={e => setAcuerdoRechazandoMotivo(e.target.value)}
                                />
                                <div className="row" style={{gap:8}}>
                                  <button className="btn btn-ghost flex-1" style={{justifyContent:'center', fontSize:12}}
                                    onClick={() => { setAcuerdoRechazandoId(null); setAcuerdoRechazandoMotivo(''); }}>
                                    Cancelar
                                  </button>
                                  <button className="btn flex-1" style={{justifyContent:'center', fontSize:12, background:'var(--danger)', color:'#fff', border:'none'}}
                                    disabled={!acuerdoRechazandoMotivo.trim()}
                                    onClick={() => { rechazarAcuerdoComision(sel.id, acuerdoRechazandoMotivo.trim()); setAcuerdoRechazandoId(null); setAcuerdoRechazandoMotivo(''); }}>
                                    Confirmar rechazo
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          if (acuerdoAprobandoEdit !== null && acuerdoAprobandoEdit._oppId === sel.id) {
                            return (
                              <div className="col" style={{gap:10}}>
                                <div style={{fontSize:12, color:'var(--fg-muted)', fontStyle:'italic'}}>
                                  Puedes ajustar los valores antes de aprobar. El vendedor será notificado si los cambias.
                                </div>
                                <div className="grid-2" style={{gap:10}}>
                                  <div className="input-group">
                                    <label style={{fontSize:11}}>% Comisión</label>
                                    <input type="number" min="0" max="100" step="0.01" className="input"
                                      value={acuerdoAprobandoEdit.pct}
                                      onChange={e => setAcuerdoAprobandoEdit(prev => ({ ...prev, pct: e.target.value }))}
                                    />
                                  </div>
                                  <div className="input-group">
                                    <label style={{fontSize:11}}>Bonificación ({monedaSimbolo})</label>
                                    <input type="number" min="0" step="0.01" className="input"
                                      value={acuerdoAprobandoEdit.bonificacion}
                                      onChange={e => setAcuerdoAprobandoEdit(prev => ({ ...prev, bonificacion: e.target.value }))}
                                    />
                                  </div>
                                </div>
                                <div className="row" style={{gap:8}}>
                                  <button className="btn btn-ghost flex-1" style={{justifyContent:'center', fontSize:12}}
                                    onClick={() => setAcuerdoAprobandoEdit(null)}>
                                    Cancelar
                                  </button>
                                  <button className="btn btn-primary flex-1" style={{justifyContent:'center', fontSize:12, background:'var(--green)', borderColor:'var(--green)'}}
                                    onClick={async () => {
                                      const ajustes = {
                                        acuerdo_pct: Number(acuerdoAprobandoEdit.pct),
                                        acuerdo_bonificacion: Number(acuerdoAprobandoEdit.bonificacion),
                                      };
                                      setAcuerdoAprobandoEdit(null);
                                      const patch = await aprobarAcuerdoComision(sel.id, ajustes);
                                      if (patch) setSel(prev => prev && prev.id === sel.id ? { ...prev, ...patch } : prev);
                                    }}>
                                    {I.check} Confirmar aprobación
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <>
                              <button className="btn btn-primary" style={{justifyContent:'center', fontSize:12, background:'var(--green)', borderColor:'var(--green)'}}
                                onClick={() => setAcuerdoAprobandoEdit({ _oppId: sel.id, pct: acuerdoOpp.pct ?? pctBase ?? 0, bonificacion: acuerdoOpp.bonificacion ?? 0 })}>
                                {I.check} Aprobar acuerdo
                              </button>
                              <button className="btn btn-ghost" style={{justifyContent:'center', fontSize:12, color:'var(--danger)'}}
                                onClick={() => { setAcuerdoRechazandoId(sel.id); setAcuerdoRechazandoMotivo(''); }}>
                                Rechazar
                              </button>
                              <button className="btn btn-ghost" style={{justifyContent:'center', fontSize:12, color:'var(--fg-muted)'}}
                                onClick={() => retirarAcuerdoComision(sel.id)}>
                                Retirar solicitud
                              </button>
                            </>
                          );
                        })()}

                        {puedeModificarAcuerdoAprobado && (
                          <div className="col" style={{gap:6}}>
                            <button className="btn btn-secondary" style={{justifyContent:'center', fontSize:12}}
                              onClick={() => setAcuerdoEdit({
                                pct: acuerdoOpp.pct ?? pctBase ?? '',
                                bonificacion: acuerdoOpp.bonificacion ?? 0,
                                justificacion: acuerdoOpp.justificacion ?? '',
                              })}>
                              {I.edit} Modificar acuerdo
                            </button>
                            <div style={{fontSize:11, color:'var(--fg-muted)', textAlign:'center', fontStyle:'italic'}}>
                              Disponible hasta que la cotizacion sea aprobada.
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Historial de movimientos */}
                      <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
                        <button
                          className="btn btn-ghost"
                          style={{width:'100%', justifyContent:'space-between', padding:'12px 14px', borderRadius:0, fontSize:12, fontWeight:600, color:'var(--fg-muted)'}}
                          onClick={() => setShowHistorial(v => !v)}
                        >
                          <span>Historial de movimientos</span>
                          <span>{showHistorial ? '▲' : '▼'}</span>
                        </button>
                        {showHistorial && (
                          <div style={{padding:'0 14px 14px'}}>
                            {acuerdoHistorialCargando ? (
                              <div style={{fontSize:12, color:'var(--fg-muted)', padding:'8px 0'}}>Cargando...</div>
                            ) : acuerdoHistorial.length === 0 ? (
                              <div style={{fontSize:12, color:'var(--fg-muted)', padding:'8px 0', fontStyle:'italic'}}>Sin movimientos registrados.</div>
                            ) : (
                              <div className="col" style={{gap:0}}>
                                {acuerdoHistorial.map((h, idx) => {
                                  const accionLabel = {
                                    propuesta: 'Propuesta creada',
                                    envio: 'Enviado a aprobación',
                                    retiro: 'Solicitud retirada',
                                    aprobacion: 'Aprobado',
                                    ajuste_gerente: 'Aprobado con ajuste',
                                    rechazo: 'Rechazado',
                                  }[h.accion] || h.accion;
                                  const accionColor = {
                                    aprobacion: 'var(--green)',
                                    ajuste_gerente: 'var(--cyan)',
                                    rechazo: 'var(--danger)',
                                    envio: 'var(--orange)',
                                    retiro: 'var(--fg-muted)',
                                    propuesta: 'var(--fg-muted)',
                                  }[h.accion] || 'var(--fg-muted)';
                                  return (
                                    <div key={h.id || idx} style={{display:'flex', gap:10, paddingTop:idx === 0 ? 8 : 0}}>
                                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', width:18, flexShrink:0}}>
                                        <div style={{width:8, height:8, borderRadius:99, background:accionColor, marginTop:4, flexShrink:0}}/>
                                        {idx < acuerdoHistorial.length - 1 && <div style={{width:1, flex:1, background:'var(--border)', marginTop:2}}/>}
                                      </div>
                                      <div style={{flex:1, paddingBottom:12}}>
                                        <div style={{fontSize:12, fontWeight:700, color:accionColor}}>{accionLabel}</div>
                                        <div style={{fontSize:11, color:'var(--fg-muted)'}}>
                                          {h.actor_nombre || 'Sistema'} · {new Date(h.created_at).toLocaleString('es-PE', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                        {(h.acuerdo_pct != null || Number(h.acuerdo_bonificacion) > 0) && (
                                          <div style={{fontSize:11, marginTop:2}}>
                                            {h.acuerdo_pct != null && <span style={{marginRight:8}}>{h.acuerdo_pct}% comisión</span>}
                                            {Number(h.acuerdo_bonificacion) > 0 && <span>+ {money(h.acuerdo_bonificacion)} bon.</span>}
                                          </div>
                                        )}
                                        {(h.justificacion || h.motivo) && (
                                          <div style={{fontSize:11, color:'var(--fg-muted)', fontStyle:'italic', marginTop:2}}>
                                            "{h.justificacion || h.motivo}"
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* ─────────────────────────────────────────────────────── */}

                </div>
              </div>
            </div>
          </>
        );
      })()}

      {agendaOpp && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Agenda comercial</div>
                <h2>Agendar seguimiento</h2>
              </div>
              <button className="icon-btn" onClick={() => setAgendaOpp(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={crearEventoDesdeOportunidad}>
              <div>
                <div className="eyebrow">Oportunidad</div>
                <div style={{fontWeight:700}}>{agendaOpp.nombre}</div>
                <div className="text-muted" style={{fontSize:12}}>{getOppCuentaNombre(agendaOpp.cuenta_id)} · {agendaOpp.responsable || 'Por asignar'}</div>
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Tipo</label>
                  <select name="tipo" className="select" required defaultValue="reunion">
                    <option value="reunion">Reunion</option>
                    <option value="visita">Visita</option>
                    <option value="llamada">Llamada</option>
                    <option value="demo">Demo</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Duracion</label>
                  <select name="duracion_minutos" className="select" defaultValue="60">
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Titulo</label>
                <input name="titulo" className="input" required defaultValue={`Seguimiento - ${agendaOpp.nombre}`} />
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Fecha</label>
                  <input name="fecha" type="date" className="input" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="input-group">
                  <label>Hora</label>
                  <input name="hora" type="time" className="input" required defaultValue="09:00" />
                </div>
              </div>
              <div className="input-group">
                <label>Notas</label>
                <textarea name="notas" className="input" rows="3" placeholder="Objetivo de la reunion o punto a tratar."></textarea>
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setAgendaOpp(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.calendar} Guardar evento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {panelNuevaOpp && (
        <>
          <div className="side-panel-backdrop" onClick={cerrarNuevaOpp}/>
          <div className="side-panel" style={{width:'min(720px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Formulario de registro</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700,marginTop:2}}>Nueva oportunidad</div>
              </div>
              <button className="icon-btn" onClick={cerrarNuevaOpp}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarNuevaOpp}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:'var(--cyan)'}}>OPORTUNIDAD</div>
              <div className="grid-2" style={{gap:14,marginBottom:20}}>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Nombre de oportunidad *</label>
                  <input className="input" required value={oppForm.nombre} onChange={e=>updateOppForm('nombre',e.target.value)} placeholder="Ej: Mantenimiento integral planta norte" autoFocus/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Cuenta *</label>
                  <select className="select" required value={oppForm.cuenta_id} onChange={e=>updateOppCuenta(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {cuentasVisibles.map(c => <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>)}
                  </select>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Servicio de interés</label>
                  <select className="select" value={oppForm.servicio_id} onChange={e=>updateOppServicio(e.target.value)} disabled={loadingServiciosOpp}>
                    <option value="">{loadingServiciosOpp ? 'Cargando servicios...' : 'Seleccionar...'}</option>
                    {serviciosOpp.map(s => (
                      <option key={s.id || s.codigo} value={s.id || s.codigo}>
                        {s.codigo ? `${s.codigo} · ` : ''}{s.descripcion}{s.moneda ? ` · ${s.moneda}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Monto estimado</label>
                  <input className="input" type="number" min="0" step="0.01" value={oppForm.monto_estimado} onChange={e=>updateOppForm('monto_estimado',e.target.value)} placeholder="0"/>
                </div>
                <div className="input-group">
                  <label>Moneda</label>
                  <select className="select" value={oppForm.moneda} onChange={e=>updateOppForm('moneda',e.target.value)}>
                    {monedasActivas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Fecha cierre estimada</label>
                  <input className="input" type="date" value={oppForm.fecha_cierre_estimada} onChange={e=>updateOppForm('fecha_cierre_estimada',e.target.value)}/>
                </div>
              </div>

              <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:'var(--fg-muted)'}}>Asignación</div>
              <div className="grid-2" style={{gap:14,marginBottom:20}}>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Responsable comercial *</label>
                  <select className="select" required value={oppForm.responsable_id} onChange={e=>updateOppResponsable(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {comercialesAsignables.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Fuente</label>
                  <select className="select" value={oppForm.fuente} onChange={e=>updateOppForm('fuente',e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {['Lead convertido','Referido','Web','LinkedIn','Recompra','Prospeccion directa'].map(f=><option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Notas</label>
                  <textarea className="input" rows={3} value={oppForm.notas} onChange={e=>updateOppForm('notas',e.target.value)} placeholder="Contexto comercial, necesidad o próximos pasos"/>
                </div>
              </div>

              <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'rgba(100,116,139,0.08)', border:'1px solid var(--border)', borderRadius:8, marginBottom:16}}>
                <span style={{fontSize:18, flexShrink:0}}>📍</span>
                <div>
                  <div style={{fontWeight:600, fontSize:13}}>Etapa inicial: Calificación</div>
                  <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>La oportunidad comienza siempre en Calificación. Avanzará automáticamente a Propuesta al enviar la cotización y a Negociación al versionar.</div>
                </div>
              </div>

              <div className="row" style={{justifyContent:'flex-end',gap:10}}>
                <button type="button" className="btn btn-secondary" onClick={cerrarNuevaOpp}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.plus} Crear oportunidad</button>
              </div>
            </form>
          </div>
        </>
      )}

      {pendingPerdida && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:440}}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Pipeline</div>
                <h2>Motivo de pérdida</h2>
              </div>
              <button className="icon-btn" onClick={() => { setPendingPerdida(null); setMotivoPerdida(''); setMotivoError(false); }}>{I.x}</button>
            </div>
            <div className="modal-body col" style={{gap:16}}>
              <p style={{fontSize:13, color:'var(--fg-muted)', margin:0}}>
                Registra por qué no se concretó esta oportunidad. Esta información ayuda a mejorar el proceso comercial.
              </p>
              <div className="input-group">
                <label>Motivo *</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Ej: Precio fuera de presupuesto, eligieron otro proveedor..."
                  value={motivoPerdida}
                  onChange={e => { setMotivoPerdida(e.target.value); if (e.target.value.trim()) setMotivoError(false); }}
                  autoFocus
                  style={{borderColor: motivoError ? 'var(--danger)' : undefined}}
                />
                {motivoError && <span style={{fontSize:11, color:'var(--danger)', marginTop:2}}>El motivo es obligatorio.</span>}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => { setPendingPerdida(null); setMotivoPerdida(''); setMotivoError(false); }}>Cancelar</button>
              <button className="btn" style={{background:'var(--danger)', color:'#fff'}} onClick={() => {
                if (!motivoPerdida.trim()) { setMotivoError(true); return; }
                marcarPerdida(pendingPerdida, motivoPerdida.trim());
                setSel(null);
                setPendingPerdida(null);
                setMotivoPerdida('');
                setMotivoError(false);
              }}>Confirmar pérdida</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ ACTIVIDADES ============
function Actividades() {
  const { actividades, cuentas, registrarActividad, actualizarActividad, searchQuery, authUser, usuarios, roles } = useApp();
  const [view, setView] = useState('agenda'); // 'agenda' | 'lista'
  const [sel, setSel] = useState(null);
  const [modalNew, setModalNew] = useState(false);

  const query = searchQuery.toLowerCase();
  const getActCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const filteredActs = actividades
    .filter(a => canUserSeeOwner({ viewer: authUser, ownerName: a.responsable, users: usuarios, roles }))
    .filter(a =>
      a.descripcion.toLowerCase().includes(query) ||
      (a.tipo || '').toLowerCase().includes(query) ||
      getActCuentaNombre(a.cuenta_id).toLowerCase().includes(query)
    );

  const cols = [
    { k: 'vencida', title: 'Vencidas', color: 'var(--danger)' },
    { k: 'pendiente', title: 'Pendientes', color: 'var(--cyan)' },
    { k: 'completada', title: 'Completadas', color: 'var(--green)' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      const actividad = actividades.find(a => a.id === id);
      if (!actividad) return;
      let newEstado = targetStatus;
      let newFecha = actividad.fecha;
      const todayStr = new Date().toISOString().split('T')[0];

      if (targetStatus === 'vencida') {
        newEstado = 'pendiente';
        if (actividad.fecha >= todayStr) {
          const ayer = new Date();
          ayer.setDate(ayer.getDate() - 1);
          newFecha = ayer.toISOString().split('T')[0];
        }
      } else if (targetStatus === 'pendiente') {
        newEstado = 'pendiente';
        if (actividad.fecha < todayStr) {
          newFecha = todayStr;
        }
      }

      actualizarActividad(id, { estado: newEstado, fecha: newFecha, moved_at: Date.now() });
    }
  };

  const getIcon = (tipo) => {
    switch(tipo) {
      case 'llamada': return I.phone;
      case 'reunion': return I.users;
      case 'visita': return I.mapPin;
      case 'email': return <span style={{fontSize:14}}>📧</span>;
      case 'tarea': default: return I.check;
    }
  };


  const today = new Date().toISOString().split('T')[0];
  const actsCalculated = filteredActs.map(a => {
    let est = a.estado;
    if (est === 'pendiente' && a.fecha < today) est = 'vencida';
    return { ...a, estado: est };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Actividades Comerciales</h1>
          <div className="page-sub">Llamadas, reuniones, visitas y tareas del equipo comercial</div>
        </div>
        <div className="row">
          <div className="segmented-control">
            <button className={`seg-btn ${view==='agenda'?'active':''}`} onClick={()=>setView('agenda')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary" data-local-form="true" onClick={() => setModalNew(true)}>{I.plus} Nueva actividad</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        {cols.map((c, i) => {
          const list = actsCalculated.filter(a => a.estado === c.k);
          const icons = [I.alert, I.clock, I.check];
          const colors = ['#64748b', '#06b6d4', '#8b5cf6'];
          return (
            <div key={c.k} className="pipeline-kpi-card hover-raise" style={{'--accent': colors[i]}}>
              <div className="pipeline-kpi-icon" style={{color: colors[i]}}>
                {icons[i]}
              </div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{list.length}</div>
              <div className="pipeline-kpi-count">Actividades {c.k}</div>
            </div>
          );
        })}
      </div>

      {view === 'agenda' ? (
        <div style={{overflowX:'auto', paddingBottom:20, marginTop:24}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = actsCalculated
                .filter(a => a.estado === c.k)
                .sort((a, b) => (b.moved_at || 0) - (a.moved_at || 0) || (b.fecha || '').localeCompare(a.fecha || ''));
              const colors = ['#64748b', '#06b6d4', '#8b5cf6'];
              return (
                <div
                  key={c.k}
                  className="kanban-col-v2"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': colors[i] }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(a => (
                        <div 
                          key={a.id} 
                          className="kanban-card-v2" 
                          draggable
                          onDragStart={(e) => startKanbanDrag(e, a.id)}
                          onDragEnd={endKanbanDrag}
                          style={{cursor: 'pointer'}}
                        >
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                            <span style={{fontSize:10, fontWeight:800, textTransform:'uppercase', color:'var(--fg-subtle)', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:4}}>
                              <span style={{width:14, height:14, display:'flex', alignItems:'center'}}>{getIcon(a.tipo)}</span>
                              {a.tipo}
                            </span>
                            <span className="badge badge-gray" style={{fontSize:9}}>{a.fecha}</span>
                          </div>
                          
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:4, lineHeight:1.4}}>
                            {a.descripcion}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:12}}>
                            {a.cuenta_id ? getActCuentaNombre(a.cuenta_id) : 'Lead/Prospecto'}
                          </div>
                          
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <div className="avatar" style={{width:24, height:24, fontSize:10, background:'var(--navy)', color:'#fff'}}>{a.responsable.charAt(0)}</div>
                              <span style={{fontSize:11, color:'var(--fg-muted)'}}>{a.responsable}</span>
                            </div>
                            <div style={{fontSize:10, fontWeight:700, color: c.k === 'vencida' ? 'var(--danger)' : 'var(--fg-muted)'}}>
                              {a.hora}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.3}}>{[I.alert, I.clock, I.check][i]}</div>
                        <p>Sin actividades {c.title.toLowerCase()}<br/><span style={{fontSize:10}}>Arrastra aquí para organizar.</span></p>
                      </div>
                    )}
                  </div>
                  
                  <button className="kanban-btn-add" data-local-form="true" onClick={() => setModalNew(true)}>
                    {I.plus} Nueva actividad
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card mt-6">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Relacionado</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {actsCalculated.map(a => (
                  <tr key={a.id} className="hover-row">
                    <td>
                      <div className="row" style={{gap:6, textTransform:'capitalize'}}>
                        <span style={{width:16, display:'flex', alignItems:'center', justifyContent:'center'}}>{getIcon(a.tipo)}</span>
                        {a.tipo}
                      </div>
                    </td>
                    <td>{a.fecha} {a.hora}</td>
                    <td style={{maxWidth:300, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={a.descripcion}>{a.descripcion}</td>
                    <td>{a.cuenta_id ? getActCuentaNombre(a.cuenta_id) : 'Lead'}</td>
                    <td>{a.responsable}</td>
                    <td>
                      <span className={'badge ' + (a.estado==='completada'?'badge-green':a.estado==='vencida'?'badge-red':'badge-cyan')}>
                        {a.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalNew && (
        <>
          <div className="side-panel-backdrop" onClick={() => setModalNew(false)}/>
          <div className="side-panel" style={{width:'min(560px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Formulario de registro</div>
                <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nueva actividad</div>
              </div>
              <button className="icon-btn" onClick={() => setModalNew(false)}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              registrarActividad({
                tipo: fd.get('tipo'),
                fecha: fd.get('fecha'),
                hora: fd.get('hora'),
                descripcion: fd.get('descripcion'),
                responsable: 'Usuario Actual'
              });
              setModalNew(false);
            }}>
              <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos de la actividad</div>
              <div className="grid-2" style={{gap:14, marginBottom:20}}>
                <div className="input-group">
                  <label>Tipo</label>
                  <select name="tipo" className="select" required>
                    <option value="reunion">Reunión</option>
                    <option value="llamada">Llamada</option>
                    <option value="email">Email</option>
                    <option value="tarea">Tarea</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Fecha</label>
                  <input name="fecha" type="date" className="input" defaultValue={today} required/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Descripción</label>
                  <textarea name="descripcion" className="input" rows="4" required autoFocus></textarea>
                </div>
              </div>
              <div className="row" style={{justifyContent:'flex-end', gap:10}}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNew(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.save} Guardar actividad</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}


// ============ OS CLIENTE ============
function FormCrearMultiplesOTs({ os, onCancel }) {
  const { cotizaciones, tiposServicio, personalOperativo, personalAdmin, centrosCosto, centrosBeneficio, crearOTDesdeOS, actualizarOT, navigate, ots, hojasCosteo, inventario, tipoCambioHoy, materiales: catalogoMateriales = [] } = useApp();
  const hoy = new Date().toISOString().split('T')[0];
  const cotizacion = cotizaciones.find(c => c.id === os.cotizacion_id) || null;
  const tiposActivos = (tiposServicio || []).filter(t => t.estado !== 'inactivo');
  const personal = getPersonalAsignableOT(personalOperativo, personalAdmin);
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const cebeHeredado = (centrosBeneficio || []).find(c => c.id === os.centro_beneficio_id);
  const itemsSugeridos = cotizacion ? (cotizacion.items || []).map(i => i.servicio || i.descripcion).filter(Boolean) : [];
  const costoHoraTec = (tec) => Number(tec?.tarifa_hora ?? tec?.costo_hora_real ?? tec?.costo ?? tec?.costo_hora ?? 0);

  const crearFila = (defaults = {}) => ({
    _id: Date.now() + Math.random(),
    _expanded: true,
    _secciones: { mano_obra: true, materiales: true, terceros: true, logistica: true },
    servicio: defaults.servicio || '',
    descripcion: defaults.descripcion || `Ejecucion de ${os.numero}`,
    centro_costo_id: defaults.centro_costo_id || '',
    fecha_programada: os.fecha_inicio || hoy,
    fecha_fin: os.fecha_fin || '',
    prioridad: 'normal',
    facturable: defaults.facturable ?? true,
    tecnico_responsable_id: '',
    direccion_ejecucion: os.sede || '',
    est_detalle: { mano_obra: [], materiales: [], terceros: [], logistica: [] },
  });

  const [filas, setFilas] = useState(() => [crearFila()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const seccionTotal = (det, key) => (det?.[key] || []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  const filaTotal = (f) => ['mano_obra', 'materiales', 'terceros', 'logistica'].reduce((s, k) => s + seccionTotal(f.est_detalle, k), 0);

  const addFila = (defaults = {}) => setFilas(prev => [...prev, crearFila(defaults)]);
  const removeFila = (id) => setFilas(prev => prev.filter(f => f._id !== id));
  const updFila = (id, k, v) => setFilas(prev => prev.map(f => f._id === id ? { ...f, [k]: v } : f));
  const toggleSec = (filaId, section) =>
    setFilas(prev => prev.map(f => f._id !== filaId ? f : { ...f, _secciones: { ...f._secciones, [section]: !(f._secciones?.[section] ?? true) } }));

  const updItem = (filaId, section, idx, field, value) =>
    setFilas(prev => prev.map(f => {
      if (f._id !== filaId) return f;
      const det = f.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
      const items = (det[section] || []).map((it, i) => {
        if (i !== idx) return it;
        const upd = { ...it, [field]: value };
        upd.subtotal = section === 'mano_obra'
          ? Number(upd.dias || 0) * Number(upd.horas_dia || 0) * Number(upd.costo_hora || 0)
          : Number(upd.cantidad || 0) * Number(upd.costo_unit || 0);
        return upd;
      });
      return { ...f, est_detalle: { ...det, [section]: items } };
    }));

  const addItem = (filaId, section) =>
    setFilas(prev => prev.map(f => {
      if (f._id !== filaId) return f;
      const det = f.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
      const newItem = section === 'mano_obra' ? { tecnico_id: '', nombre: '', dias: 1, horas_dia: 8, costo_hora: 0, subtotal: 0 }
        : section === 'materiales' ? { inv_id: '', nombre: '', cantidad: 1, unidad: '', costo_unit: 0, subtotal: 0 }
        : { descripcion: '', cantidad: 1, unidad: 'und', costo_unit: 0, subtotal: 0 };
      return { ...f, est_detalle: { ...det, [section]: [...(det[section] || []), newItem] } };
    }));

  const removeItem = (filaId, section, idx) =>
    setFilas(prev => prev.map(f => {
      if (f._id !== filaId) return f;
      const det = f.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
      return { ...f, est_detalle: { ...det, [section]: (det[section] || []).filter((_, i) => i !== idx) } };
    }));

  const updTecnicoItem = (filaId, idx, { id: tecnicoId, nombre, costo_hora: ch, costo_hora_pen: chPEN }) =>
    setFilas(prev => prev.map(f => {
      if (f._id !== filaId) return f;
      const det = f.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
      const items = (det.mano_obra || []).map((it, i) => {
        if (i !== idx) return it;
        const upd = { ...it, tecnico_id: tecnicoId, nombre, costo_hora: ch, costo_hora_pen: chPEN };
        upd.subtotal = Number(upd.dias || 0) * Number(upd.horas_dia || 0) * ch;
        return upd;
      });
      return { ...f, est_detalle: { ...det, mano_obra: items } };
    }));

  const updMaterialItem = (filaId, idx, { mat_id, nombre, unidad, costo_unit }) =>
    setFilas(prev => prev.map(f => {
      if (f._id !== filaId) return f;
      const det = f.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
      const items = (det.materiales || []).map((it, i) => {
        if (i !== idx) return it;
        const upd = { ...it, inv_id: mat_id, nombre, unidad, costo_unit };
        upd.subtotal = Number(upd.cantidad || 0) * costo_unit;
        return upd;
      });
      return { ...f, est_detalle: { ...det, materiales: items } };
    }));

  const hcVinculada = cotizacion?.hoja_costeo_id
    ? (hojasCosteo || []).find(h => h.id === cotizacion.hoja_costeo_id && h.estado === 'aprobada')
    : null;

  const importarDesdeHC = (filaId) => {
    if (!hcVinculada) return;
    setFilas(prev => prev.map(f => f._id !== filaId ? f : {
      ...f,
      est_detalle: {
        mano_obra: hcVinculada.total_mano_obra > 0 ? [{ tecnico_id: '', nombre: 'Referencia HC', dias: 1, horas_dia: 1, costo_hora: Number(hcVinculada.total_mano_obra), subtotal: Number(hcVinculada.total_mano_obra) }] : [],
        materiales: hcVinculada.total_materiales > 0 ? [{ inv_id: '', nombre: 'Materiales (HC)', cantidad: 1, unidad: 'global', costo_unit: Number(hcVinculada.total_materiales), subtotal: Number(hcVinculada.total_materiales) }] : [],
        terceros: hcVinculada.total_servicios_terceros > 0 ? [{ descripcion: 'Servicios terceros (HC)', cantidad: 1, unidad: 'global', costo_unit: Number(hcVinculada.total_servicios_terceros), subtotal: Number(hcVinculada.total_servicios_terceros) }] : [],
        logistica: hcVinculada.total_logistica > 0 ? [{ descripcion: 'Logística (HC)', cantidad: 1, unidad: 'global', costo_unit: Number(hcVinculada.total_logistica), subtotal: Number(hcVinculada.total_logistica) }] : [],
      },
    }));
  };

  const otsExistentes = (ots || []).filter(o => o.os_cliente_id === os.id && !['anulada'].includes(o.estado));
  const totalOTsExistentes = otsExistentes.reduce((s, o) => s + Number(o.costoEst || o.costo_estimado || 0), 0);
  const hcSaldoNoAsignado = hcVinculada ? (hcVinculada.costo_total || 0) - totalOTsExistentes : 0;
  const montoBase = hcVinculada ? (hcVinculada.costo_total || 0) : Number(os.monto_aprobado || 0);
  const totalAsignado = filas.reduce((s, f) => s + filaTotal(f), 0);
  const saldoBase = montoBase - totalOTsExistentes;
  const saldoLibre = saldoBase - totalAsignado;
  const pct = montoBase > 0 ? Math.min(100, Math.round(((totalOTsExistentes + totalAsignado) / montoBase) * 100)) : 0;
  const nOTs = filas.length;
  const esAdicional = montoBase > 0 && ((saldoBase <= 0 && totalAsignado > 0) || (saldoBase > 0 && saldoLibre < 0));

  const submit = async () => {
    if (filas.some(f => !f.servicio.trim())) { setError('Todas las OTs deben tener un servicio asignado.'); return; }
    if (filas.some(f => !f.centro_costo_id)) { setError('Todas las OTs deben tener un CECO asignado.'); return; }
    if (!os.centro_beneficio_id) { setError('La OS Cliente no tiene CEBE asignado. Asígnalo desde la ficha de la OS antes de crear OTs.'); return; }
    setSaving(true); setError('');
    try {
      for (const fila of filas) {
        const { _id, _expanded, _secciones, est_detalle: det, ...datos } = fila;
        const d = det || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
        const mo  = seccionTotal(d, 'mano_obra');
        const mat = seccionTotal(d, 'materiales');
        const ter = seccionTotal(d, 'terceros');
        const log = seccionTotal(d, 'logistica');
        const total = mo + mat + ter + log;
        const usaTC = os.moneda === 'USD' && tipoCambioHoy?.usd && (d.mano_obra || []).some(it => it.costo_hora_pen > 0);
        const detFinal = usaTC ? { ...d, tc_usado: { usd: tipoCambioHoy.usd, fecha: tipoCambioHoy.fecha } } : d;
        const otId = await crearOTDesdeOS(os.id, {
          ...datos,
          est_mo: mo || null, est_materiales: mat || null, est_terceros: ter || null, est_logistica: log || null,
          costo_estimado: total, est_detalle: detFinal, es_adicional: esAdicional,
        });
        if (!otId) throw new Error('No se pudo crear una de las OTs.');
        // Guardar est_detalle via actualizarOT (el RPC no lo incluye)
        if (Object.values(d).some(arr => arr.length > 0) || usaTC) {
          actualizarOT(otId, { est_detalle: detFinal });
        }
      }
      navigate('os_cliente', { detail: os.id, tab: 'OTs' });
    } catch (err) {
      setError(err?.message || 'No se pudieron crear las OTs.');
    } finally { setSaving(false); }
  };

  const inSt = { fontSize: 12, padding: '4px 6px' };

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{os.numero} › Nueva{nOTs > 1 ? 's' : ''} Orden{nOTs > 1 ? 'es' : ''} de Trabajo</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{nOTs <= 1 ? 'Nueva OT' : `Nuevas OTs (${nOTs})`}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!saving && !filas.every(f => f.servicio.trim() && f.centro_costo_id) && (
            <span style={{ fontSize: 11, color: '#ef4444' }}>Completa Servicio y CECO en cada fila</span>
          )}
          <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" style={esAdicional ? { background: '#f97316', borderColor: '#f97316' } : {}}
            onClick={submit} disabled={saving || !filas.every(f => f.servicio.trim() && f.centro_costo_id)}>
            {saving ? 'Creando...' : esAdicional
              ? `Crear ${nOTs} OT${nOTs > 1 ? 's' : ''} adicional${nOTs > 1 ? 'es' : ''}`
              : `Crear ${nOTs} OT${nOTs > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {/* CEBE heredado */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Centro de Beneficio (CEBE) — heredado de la OS</label>
        <div style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, color: cebeHeredado ? '#111' : '#ef4444' }}>
          {cebeHeredado ? (cebeHeredado.codigo ? `${cebeHeredado.codigo} – ${cebeHeredado.nombre}` : cebeHeredado.nombre) : 'Sin CEBE — asígnalo en la ficha de la OS'}
        </div>
      </div>

      {/* Cotización vinculada */}
      {cotizacion && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Cotización vinculada</span>
            <span style={{ fontSize: 12, color: '#666' }}>{cotizacion.numero || cotizacion.id}</span>
            {cotizacion.estado && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: cotizacion.estado === 'aprobada' ? '#dcfce7' : '#fef9c3', color: cotizacion.estado === 'aprobada' ? '#166534' : '#854d0e', fontWeight: 600 }}>
                {cotizacion.estado.charAt(0).toUpperCase() + cotizacion.estado.slice(1)}
              </span>
            )}
            {cotizacion.total != null && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{moneyCurrency(cotizacion.total, os.moneda)}</span>}
          </div>
          {Array.isArray(cotizacion.items) && cotizacion.items.length > 0 && (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>Servicio</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>Cant.</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>P.Unit.</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>Subtotal</th>
                  <th style={{ padding: '6px 4px', borderBottom: '1px solid #e5e7eb' }}></th>
                </tr>
              </thead>
              <tbody>
                {cotizacion.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px' }}>{item.servicio || item.descripcion || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.cantidad ?? '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.precio_unitario != null ? moneyCurrency(item.precio_unitario, os.moneda) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{item.subtotal != null ? moneyCurrency(item.subtotal, os.moneda) : '—'}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                        onClick={() => addFila({ servicio: item.servicio || item.descripcion || '' })} title="Agregar como OT">→ OT</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* HC vinculada */}
      {hcVinculada && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Hoja de Costeo vinculada</span>
            <span style={{ fontSize: 12, color: '#0369a1' }}>{hcVinculada.numero} · <span className="badge badge-green" style={{ fontSize: 10 }}>Aprobada</span></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px 16px', marginBottom: 10, fontSize: 13 }}>
            {[['Mano de Obra', hcVinculada.total_mano_obra || 0], ['Materiales', hcVinculada.total_materiales || 0], ['Servicios Terceros', hcVinculada.total_servicios_terceros || 0], ['Logística', hcVinculada.total_logistica || 0]].map(([label, val]) => (
              <div key={label}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 1 }}>{label}</div><div style={{ fontWeight: 600 }}>{moneyCurrency(val, os.moneda)}</div></div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13 }}>
              Costo total HC: <strong>{moneyCurrency(hcVinculada.costo_total || 0, os.moneda)}</strong>
              {otsExistentes.length > 0 && <span style={{ marginLeft: 16 }}>Saldo sin asignar: <strong style={{ color: hcSaldoNoAsignado < 0 ? '#dc2626' : '#0369a1' }}>{moneyCurrency(hcSaldoNoAsignado, os.moneda)}</strong></span>}
            </div>
            <div style={{ fontSize: 11, color: '#0369a1' }}>Usa "Importar desde HC" en cada OT para copiar los valores como punto de partida editable.</div>
          </div>
        </div>
      )}

      {/* Control de costo */}
      {montoBase > 0 && (
        <div style={{ background: saldoBase < 0 ? '#fef2f2' : saldoBase === 0 ? '#fff7ed' : '#f0fdf4', border: `1px solid ${saldoBase < 0 ? '#fca5a5' : saldoBase === 0 ? '#fed7aa' : '#86efac'}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{hcVinculada ? 'Control de costo — HC aprobada' : 'Valor del contrato'}</span>
            <span style={{ fontSize: 13 }}>{hcVinculada ? 'Presupuesto de costo:' : 'Valor del contrato:'} <strong>{moneyCurrency(montoBase, os.moneda)}</strong></span>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11, color: '#666' }}>
              <span>{hcVinculada ? 'Costo asignado a OTs' : 'Valor asignado a OTs'}</span><span>{pct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#ef4444' : pct >= 100 ? '#f97316' : '#3b82f6', borderRadius: 3, transition: 'width .3s' }} />
            </div>
          </div>
          {otsExistentes.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OTs ya vinculadas</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'rgba(0,0,0,0.04)' }}><th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600 }}>OT</th><th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600 }}>Servicio</th><th style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>Monto est.</th><th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 600 }}>Estado</th></tr></thead>
                <tbody>
                  {otsExistentes.map(ot => (
                    <tr key={ot.id} style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '3px 6px', fontFamily: 'monospace', fontWeight: 600 }}>{ot.numero}</td>
                      <td style={{ padding: '3px 6px' }}>{ot.tipo || ot.servicio || '—'}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{moneyCurrency(ot.costoEst || ot.costo_estimado || 0, os.moneda)}</td>
                      <td style={{ padding: '3px 6px' }}><span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,0,0,0.06)', color: '#555' }}>{(ot.estado || 'programada').replace(/_/g, ' ')}</span></td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <td colSpan="2" style={{ padding: '4px 6px', fontWeight: 600, fontSize: 12, color: '#555' }}>Total asignado en OTs existentes</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{moneyCurrency(totalOTsExistentes, os.moneda)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: otsExistentes.length > 0 ? 8 : 0, borderTop: otsExistentes.length > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none' }}>
            <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
              {hcVinculada ? 'Saldo de costo disponible:' : 'Saldo del contrato:'} <strong style={{ color: saldoBase < 0 ? '#dc2626' : saldoBase === 0 ? '#d97706' : '#16a34a', fontSize: 14 }}>{moneyCurrency(saldoBase, os.moneda)}</strong>
            </div>
            {saldoBase <= 0 && (
              <div style={{ fontSize: 12, color: saldoBase < 0 ? '#dc2626' : '#d97706' }}>
                {saldoBase < 0 ? (hcVinculada ? '⚠ Los costos superan el presupuesto de la HC. Esta OT será trabajo adicional no planificado.' : '⚠ El valor asignado supera el contrato. Esta OT será adicional al alcance original.') : (hcVinculada ? '⚠ El presupuesto de costo de la HC está completamente asignado. Puedes agregar OTs adicionales.' : '⚠ El valor del contrato está completamente asignado. Puedes crear OTs adicionales.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OTs a crear */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Órdenes de Trabajo a crear</div>
          {!hcVinculada && cotizacion && <span style={{ fontSize: 11, color: '#888' }}>Sin hoja de costeo vinculada — el estimado es referencial.</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filas.map((fila, idx) => {
            const det = fila.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] };
            const mo  = seccionTotal(det, 'mano_obra');
            const mat = seccionTotal(det, 'materiales');
            const ter = seccionTotal(det, 'terceros');
            const log = seccionTotal(det, 'logistica');
            const total = mo + mat + ter + log;
            const isExp = fila._expanded;

            return (
              <div key={fila._id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
                {/* Compact row */}
                <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 90px 90px 1fr 88px auto', gap: '6px 8px', padding: '10px 12px', alignItems: 'center', borderBottom: isExp ? '1px solid #e5e7eb' : 'none' }}>
                  <span style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>{idx + 1}</span>
                  {/* Servicio */}
                  <div>
                    {itemsSugeridos.length > 0 ? (
                      <><input className="input" list={`svc-${fila._id}`} value={fila.servicio} onChange={e => updFila(fila._id, 'servicio', e.target.value)} placeholder="Servicio *" style={inSt} /><datalist id={`svc-${fila._id}`}>{itemsSugeridos.map((s, i) => <option key={i} value={s} />)}</datalist></>
                    ) : tiposActivos.length > 0 ? (
                      <select className="select" value={fila.servicio} onChange={e => updFila(fila._id, 'servicio', e.target.value)} style={inSt}><option value="">— Servicio * —</option>{tiposActivos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}</select>
                    ) : (
                      <input className="input" value={fila.servicio} onChange={e => updFila(fila._id, 'servicio', e.target.value)} placeholder="Servicio *" style={inSt} />
                    )}
                  </div>
                  {/* CECO */}
                  <select className="select" value={fila.centro_costo_id} onChange={e => updFila(fila._id, 'centro_costo_id', e.target.value)} style={inSt}>
                    <option value="">— CECO * —</option>
                    {cecos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} – ` : ''}{c.nombre}</option>)}
                  </select>
                  {/* Fechas */}
                  <input className="input" type="date" value={fila.fecha_programada} onChange={e => updFila(fila._id, 'fecha_programada', e.target.value)} style={inSt} />
                  <input className="input" type="date" value={fila.fecha_fin} onChange={e => updFila(fila._id, 'fecha_fin', e.target.value)} style={inSt} />
                  {/* Colaborador */}
                  <ColaboradorAutocomplete
                    value={{ id: fila.tecnico_responsable_id, nombre: personal.find(p => p.id === fila.tecnico_responsable_id)?.nombre || '' }}
                    onChange={sel => updFila(fila._id, 'tecnico_responsable_id', sel.id)}
                    personalOperativo={personalOperativo}
                    personalAdmin={personalAdmin}
                    monedaOT={os.moneda}
                    tipoCambioHoy={tipoCambioHoy}
                    style={inSt}
                  />
                  {/* Prioridad */}
                  <select className="select" value={fila.prioridad} onChange={e => updFila(fila._id, 'prioridad', e.target.value)} style={inSt}>
                    <option value="normal">Normal</option><option value="urgente">Urgente</option><option value="critica">Crítica</option>
                  </select>
                  {/* Total + toggle + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: total > 0 ? '#111' : '#9ca3af' }}>{moneyCurrency(total, os.moneda)}</span>
                    <button type="button" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: isExp ? '#eff6ff' : '#f9fafb', color: isExp ? '#1d4ed8' : '#6b7280', border: '1px solid #e5e7eb', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => updFila(fila._id, '_expanded', !isExp)}>{isExp ? '▲ ocultar' : '▼ detallar'}</button>
                    <button type="button" style={{ padding: '2px 6px', color: '#ef4444', background: 'none', border: 'none', fontSize: 16, lineHeight: 1, cursor: filas.length === 1 ? 'not-allowed' : 'pointer', opacity: filas.length === 1 ? 0.3 : 1 }} onClick={() => removeFila(fila._id)} disabled={filas.length === 1}>×</button>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExp && (
                  <div style={{ padding: '16px 16px 20px' }}>
                    {hcVinculada && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => importarDesdeHC(fila._id)}>📋 Importar desde HC</button>
                      </div>
                    )}

                    {/* 4 sections */}
                    {[
                      { key: 'mano_obra',  label: 'Mano de obra',        hcVal: hcVinculada?.total_mano_obra,          secTotal: mo  },
                      { key: 'materiales', label: 'Materiales',           hcVal: hcVinculada?.total_materiales,         secTotal: mat },
                      { key: 'terceros',   label: 'Servicios terceros',   hcVal: hcVinculada?.total_servicios_terceros, secTotal: ter },
                      { key: 'logistica',  label: 'Logística y viáticos', hcVal: hcVinculada?.total_logistica,          secTotal: log },
                    ].map(({ key, label, hcVal, secTotal }) => {
                      const items = det[key] || [];
                      const secExp = fila._secciones?.[key] ?? true;
                      return (
                        <div key={key} style={{ marginBottom: 10, border: '1px solid #f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSec(fila._id, key)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 10, color: '#9ca3af' }}>{secExp ? '▼' : '▶'}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151' }}>{label}</span>
                              {hcVal != null && <span style={{ fontSize: 11, color: '#6b7280' }}>Ref. HC: {moneyCurrency(hcVal, os.moneda)}</span>}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: secTotal > 0 ? '#111' : '#9ca3af' }}>{moneyCurrency(secTotal, os.moneda)}</span>
                          </div>
                          {secExp && (
                            <div style={{ padding: '10px 12px' }}>
                              {items.length > 0 && (
                                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                      {key === 'mano_obra' ? (
                                        <><th style={{ textAlign: 'left', padding: '3px 4px', color: '#6b7280', fontWeight: 600 }}>Colaborador</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 54 }}>Días</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 62 }}>Hrs/día</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 88 }}>Costo/h</th></>
                                      ) : key === 'materiales' ? (
                                        <><th style={{ textAlign: 'left', padding: '3px 4px', color: '#6b7280', fontWeight: 600 }}>Material</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 58 }}>Cant.</th><th style={{ textAlign: 'left', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 52 }}>Unidad</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 90 }}>Costo u.</th></>
                                      ) : (
                                        <><th style={{ textAlign: 'left', padding: '3px 4px', color: '#6b7280', fontWeight: 600 }}>Descripción</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 58 }}>Cant.</th><th style={{ textAlign: 'left', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 58 }}>Unidad</th><th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 90 }}>Costo u.</th></>
                                      )}
                                      <th style={{ textAlign: 'right', padding: '3px 4px', color: '#6b7280', fontWeight: 600, width: 84 }}>Subtotal</th>
                                      <th style={{ width: 24 }} />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item, itemIdx) => (
                                      <tr key={itemIdx} style={{ borderBottom: '1px solid #f9fafb' }}>
                                        {key === 'mano_obra' ? (
                                          <>
                                            <td style={{ padding: '3px 4px' }}>
                                              <ColaboradorAutocomplete
                                                value={{ id: item.tecnico_id, nombre: item.nombre }}
                                                onChange={sel => updTecnicoItem(fila._id, itemIdx, sel)}
                                                personalOperativo={personalOperativo}
                                                personalAdmin={personalAdmin}
                                                monedaOT={os.moneda}
                                                tipoCambioHoy={tipoCambioHoy}
                                                inlineOptions
                                              />
                                            </td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" type="number" min="0.5" step="0.5" style={{ fontSize: 11, padding: '3px 5px', width: '100%', textAlign: 'right' }} value={item.dias} onChange={e => updItem(fila._id, 'mano_obra', itemIdx, 'dias', e.target.value)} /></td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" type="number" min="0.5" max="24" step="0.5" style={{ fontSize: 11, padding: '3px 5px', width: '100%', textAlign: 'right' }} value={item.horas_dia} onChange={e => updItem(fila._id, 'mano_obra', itemIdx, 'horas_dia', e.target.value)} /></td>
                                            <td style={{ padding: '3px 4px', textAlign: 'right', color: '#6b7280', fontSize: 11 }}>
                                              {item.costo_hora > 0 ? (
                                                <>
                                                  <div>{moneyCurrency(item.costo_hora, os.moneda)}</div>
                                                  {os.moneda === 'USD' && item.costo_hora_pen > 0 && tipoCambioHoy?.usd && (
                                                    <div style={{ fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }} title={`TC: ${(1/tipoCambioHoy.usd).toFixed(2)} · ${tipoCambioHoy.fecha}`}>
                                                      S/ {item.costo_hora_pen.toFixed(2)}/h
                                                    </div>
                                                  )}
                                                </>
                                              ) : '—'}
                                            </td>
                                          </>
                                        ) : key === 'materiales' ? (
                                          <>
                                            <td style={{ padding: '3px 4px' }}>
                                              <MaterialAutocomplete
                                                value={{ mat_id: item.inv_id, nombre: item.nombre }}
                                                onChange={sel => updMaterialItem(fila._id, itemIdx, sel)}
                                                materiales={catalogoMateriales}
                                                inventario={inventario}
                                                inlineOptions
                                              />
                                            </td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" type="number" min="0" step="0.01" style={{ fontSize: 11, padding: '3px 5px', width: '100%', textAlign: 'right' }} value={item.cantidad} onChange={e => updItem(fila._id, 'materiales', itemIdx, 'cantidad', e.target.value)} /></td>
                                            <td style={{ padding: '3px 4px', fontSize: 11, color: '#6b7280' }}>{item.unidad || '—'}</td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" type="number" min="0" step="0.01" style={{ fontSize: 11, padding: '3px 5px', width: '100%', textAlign: 'right' }} value={item.costo_unit} onChange={e => updItem(fila._id, 'materiales', itemIdx, 'costo_unit', e.target.value)} /></td>
                                          </>
                                        ) : (
                                          <>
                                            <td style={{ padding: '3px 4px' }}><input className="input" style={{ fontSize: 11, padding: '3px 5px', width: '100%' }} placeholder="Descripción..." value={item.descripcion} onChange={e => updItem(fila._id, key, itemIdx, 'descripcion', e.target.value)} /></td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" type="number" min="0" step="0.01" style={{ fontSize: 11, padding: '3px 5px', width: '100%', textAlign: 'right' }} value={item.cantidad} onChange={e => updItem(fila._id, key, itemIdx, 'cantidad', e.target.value)} /></td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" style={{ fontSize: 11, padding: '3px 5px', width: '100%' }} placeholder="und" value={item.unidad} onChange={e => updItem(fila._id, key, itemIdx, 'unidad', e.target.value)} /></td>
                                            <td style={{ padding: '3px 4px' }}><input className="input" type="number" min="0" step="0.01" style={{ fontSize: 11, padding: '3px 5px', width: '100%', textAlign: 'right' }} value={item.costo_unit} onChange={e => updItem(fila._id, key, itemIdx, 'costo_unit', e.target.value)} /></td>
                                          </>
                                        )}
                                        <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 600 }}>{item.subtotal > 0 ? moneyCurrency(item.subtotal, os.moneda) : '—'}</td>
                                        <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                                          <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }} onClick={() => removeItem(fila._id, key, itemIdx)}>×</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <button type="button" style={{ fontSize: 11, padding: '3px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', color: '#374151' }} onClick={() => addItem(fila._id, key)}>
                                + Agregar {key === 'mano_obra' ? 'colaborador' : key === 'materiales' ? 'material' : key === 'terceros' ? 'servicio' : 'gasto'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Resumen */}
                    <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 12, marginTop: 4 }}>
                      {[['Mano de obra', mo], ['Materiales', mat], ['Servicios terceros', ter], ['Logística y viáticos', log]].map(([lbl, val]) => (
                        <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', color: val > 0 ? '#374151' : '#9ca3af' }}>
                          <span>{lbl}</span><span>{moneyCurrency(val, os.moneda)}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                        <span>Total estimado</span>
                        <span style={{ color: total > 0 ? '#111' : '#9ca3af' }}>{moneyCurrency(total, os.moneda)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => addFila()}>+ Agregar OT</button>
          <span style={{ fontSize: 11, color: '#888' }}>El costo real se acumula automáticamente desde los Partes Diarios.</span>
        </div>
      </div>
    </div>
  );
}

function FormCrearOT({ os, onSave, onCancel }) {
  const { personalOperativo, personalAdmin, tiposServicio, centrosCosto, centrosBeneficio } = useApp();
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const cebeHeredado = (centrosBeneficio || []).find(c => c.id === os.centro_beneficio_id);
  const [form, setForm] = useState({
    servicio: '',
    descripcion: `Ejecucion de ${os.numero}`,
    costo_estimado: os.saldo_por_ejecutar || os.monto_aprobado || 0,
    fecha_programada: os.fecha_inicio || new Date().toISOString().split('T')[0],
    fecha_fin: os.fecha_fin || '',
    direccion_ejecucion: os.sede || os.direccion_ejecucion || '',
    tecnico_responsable_id: '',
    supervisor_id: '',
    supervisor: '',
    prioridad: 'normal',
    facturable: true,
    centro_costo_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const tiposActivos = tiposServicio.filter(t => t.estado !== 'inactivo');
  const personal = getPersonalAsignableOT(personalOperativo, personalAdmin);

  const handleServicioChange = (e) => {
    const val = e.target.value;
    upd('servicio', val);
    const tipo = tiposActivos.find(t => t.nombre === val);
    if (tipo?.facturable !== undefined) upd('facturable', tipo.facturable);
  };

  const submit = async () => {
    if (saving) return;
    if (!form.centro_costo_id) {
      setError('Este campo es obligatorio. Selecciona un CECO antes de continuar.');
      return;
    }
    if (!os.centro_beneficio_id) {
      setError('La OS Cliente vinculada no tiene un CEBE asignado. Complétalo antes de crear la OT.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err?.message || 'No se pudo crear la OT.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a {os.numero}</button>
          <h1 className="page-title">Nueva Orden de Trabajo</h1>
          <div className="page-sub">Vinculada a OS Cliente <strong style={{color:'var(--fg)'}}>{os.numero}</strong></div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-primary" data-local-form="true" disabled={saving || !form.servicio} onClick={submit}>{I.check} {saving ? 'Creando...' : 'Crear OT'}</button>
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-body">
          {error && <div className="alert alert-danger" style={{marginBottom:16}}>{error}</div>}

          <div style={{marginBottom:20}}>
            <div className="eyebrow" style={{marginBottom:12}}>Identificación</div>
            <div className="grid-2" style={{gap:16}}>
              <div className="input-group">
                <label>Servicio / tipo <span style={{color:'var(--danger)'}}>*</span></label>
                {tiposActivos.length > 0 ? (
                  <select className="select" value={form.servicio} onChange={handleServicioChange} required>
                    <option value="">Seleccionar servicio...</option>
                    {tiposActivos.map(t => (
                      <option key={t.id} value={t.nombre}>{t.codigo ? `[${t.codigo}] ` : ''}{t.nombre}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" value={form.servicio} onChange={e => upd('servicio', e.target.value)} placeholder="Ej. Mantenimiento preventivo" required />
                )}
              </div>
              <div className="input-group">
                <label>Monto planificado</label>
                <input className="input" type="number" min="0" value={form.costo_estimado} onChange={e => upd('costo_estimado', e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{marginBottom:20}}>
            <div className="eyebrow" style={{marginBottom:12}}>Vinculación</div>
            <div className="grid-2" style={{gap:16, marginBottom:20}}>
              <div className="input-group">
                <label>CECO <span style={{color:'var(--danger)'}}>*</span></label>
                <select className="select" value={form.centro_costo_id} onChange={e => upd('centro_costo_id', e.target.value)} required>
                  <option value="">{cecosActivos.length ? 'Seleccionar CECO...' : 'No hay Centros de Costo activos. Crea uno en Maestros Base antes de continuar.'}</option>
                  {cecosActivos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>CEBE</label>
                <input className="input" readOnly value={cebeHeredado ? `${cebeHeredado.codigo} - ${cebeHeredado.nombre}` : ''} placeholder="Se hereda de la OS Cliente" style={{opacity:0.75}} />
              </div>
            </div>
            <div className="eyebrow" style={{marginBottom:12}}>Planificación</div>
            <div className="grid-2" style={{gap:16}}>
              <div className="input-group">
                <label>Fecha de inicio</label>
                <input className="input" type="date" value={form.fecha_programada} onChange={e => upd('fecha_programada', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Fecha fin programada</label>
                <input className="input" type="date" value={form.fecha_fin} onChange={e => upd('fecha_fin', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Prioridad</label>
                <select className="select" value={form.prioridad} onChange={e => upd('prioridad', e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
              <div className="input-group">
                <label>Facturación</label>
                <select className="select" value={form.facturable ? 'true' : 'false'} onChange={e => upd('facturable', e.target.value === 'true')}>
                  <option value="true">Facturable</option>
                  <option value="false">No facturable</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{marginBottom:20}}>
            <div className="eyebrow" style={{marginBottom:12}}>Responsables</div>
            <div className="grid-2" style={{gap:16}}>
              <div className="input-group">
                <label>Colaborador responsable</label>
                <ColaboradorAutocomplete
                  value={{ id: form.tecnico_responsable_id, nombre: personal.find(p => p.id === form.tecnico_responsable_id)?.nombre || '' }}
                  onChange={sel => upd('tecnico_responsable_id', sel.id)}
                  personalOperativo={personalOperativo}
                  personalAdmin={personalAdmin}
                  monedaOT={os?.moneda || 'PEN'}
                  tipoCambioHoy={null}
                />
              </div>
              <div className="input-group">
                <label>Supervisor</label>
                <select className="select" value={form.supervisor_id} onChange={e => {
                  const p = personal.find(x => x.id === e.target.value);
                  upd('supervisor_id', e.target.value);
                  upd('supervisor', p?.nombre || '');
                }}>
                  <option value="">Sin asignar</option>
                  {personal.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.cargo ? ` — ${p.cargo}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{marginBottom:12}}>Ubicación y alcance</div>
            <div className="col" style={{gap:16}}>
              <div className="input-group">
                <label>Dirección de ejecución</label>
                <input className="input" value={form.direccion_ejecucion} onChange={e => upd('direccion_ejecucion', e.target.value)} placeholder="Dirección donde se realizará el trabajo" />
              </div>
              <div className="input-group">
                <label>Descripción / alcance</label>
                <textarea className="input" rows="3" value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} style={{resize:'vertical'}} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

function CambiarEstadoOSModal({ os, tipo, onClose, onConfirm, saving }) {
  const [motivo, setMotivo] = useState('');
  const necesitaMotivo = ['en_pausa', 'anulada'].includes(tipo);
  const LABELS = { cerrada: 'Cerrar', en_pausa: 'Pausar', anulada: 'Anular' };
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:420}}>
        <div className="modal-head">
          <h2>{LABELS[tipo] || tipo} OS {os.numero}</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body col" style={{gap:14}}>
          {tipo === 'cerrada' && (
            <div style={{padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
              El sistema verificará que no haya OTs abiertas ni saldo pendiente de facturar antes de cerrar.
            </div>
          )}
          {necesitaMotivo && (
            <div className="input-group">
              <label>Motivo <span style={{color:'var(--danger)'}}>*</span></label>
              <textarea className="input" rows="3" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe el motivo..." autoFocus />
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || (necesitaMotivo && !motivo.trim())} onClick={() => onConfirm(motivo)}>
            {saving ? 'Guardando...' : `${LABELS[tipo] || 'Confirmar'} OS`}
          </button>
        </div>
      </div>
    </div>
  );
}

function NuevoHitoModal({ moneda, onClose, onSave }) {
  const [form, setForm] = useState({ concepto: '', monto: '', fecha_esperada: '' });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:400}}>
        <div className="modal-head">
          <h2>Agregar hito de facturación</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <form className="modal-body col" style={{gap:14}} onSubmit={e => { e.preventDefault(); onSave({ concepto: form.concepto, monto: Number(form.monto || 0), fecha_esperada: form.fecha_esperada }); }}>
          <div className="input-group">
            <label>Concepto <span style={{color:'var(--danger)'}}>*</span></label>
            <input className="input" value={form.concepto} onChange={e => upd('concepto', e.target.value)} required placeholder="Ej. Anticipo 30%" autoFocus />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Monto ({moneda})</label>
              <input className="input" type="number" min="0" value={form.monto} onChange={e => upd('monto', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Fecha esperada</label>
              <input className="input" type="date" value={form.fecha_esperada} onChange={e => upd('fecha_esperada', e.target.value)} />
            </div>
          </div>
          <div className="modal-foot mt-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{I.check} Agregar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OSCliente() {
  const {
    osClientes, cuentas, cotizaciones, ots, valorizaciones, facturas, cxc,
    activeParams, navigate, searchQuery, usuarios,
    cambiarEstadoOS, actualizarHitosFacturacion, vincularCotizacionOS, actualizarOT, eliminarOT,
    actualizarOSCliente, centrosBeneficio,
    partes, personalOperativo, personalAdmin, inventario,
  } = useApp();

  const calcCostoRealLiveOS = (ot) => {
    const aprobados = (partes || []).filter(p => p.ot_id === ot.id && p.estado === 'aprobado');
    if (!aprobados.length) return ot.costoReal || ot.costo_real || 0;
    const allPersonal = [...(personalOperativo || []), ...(personalAdmin || [])];
    const costoHora = (tecnicoId) => {
      const moItem = ((ot.realDetalle?.mano_obra?.length ? ot.realDetalle : ot.est_detalle)?.mano_obra || [])
        .find(m => m.tecnico_id === tecnicoId);
      if (moItem?.costo_hora > 0) return moItem.costo_hora;
      const tec = allPersonal.find(p => p.id === tecnicoId);
      const explicit = Number(tec?.tarifa_hora ?? tec?.costo_hora_real ?? tec?.costo ?? tec?.costo_hora ?? 0);
      if (explicit > 0) return explicit;
      return 0;
    };
    const mo  = aprobados.reduce((s, p) => s + (p.horas || 0) * costoHora(p.tecnico_id), 0);
    const mat = aprobados.reduce((s, p) =>
      s + (p.materiales_usados || []).reduce((sm, m) => {
        const inv = (inventario || []).find(i => i.sku === m.sku);
        return sm + (m.cantidad || 0) * (inv?.costo_promedio || m.costo_unitario || 0);
      }, 0), 0);
    const ter = aprobados.reduce((s, p) =>
      s + (p.terceros_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);
    const log = aprobados.reduce((s, p) =>
      s + (p.logistica_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);
    return mo + mat + ter + log;
  };

  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [modalEstado, setModalEstado] = useState(null);
  const [nuevoHito, setNuevoHito] = useState(null);
  const [vinCotModal, setVinCotModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editandoNumCliente, setEditandoNumCliente] = useState(false);
  const [numClienteTemp, setNumClienteTemp] = useState('');
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreTemp, setNombreTemp] = useState('');

  useEffect(() => {
    setEditandoNumCliente(false);
    setNumClienteTemp('');
    setEditandoNombre(false);
    setNombreTemp('');
  }, [activeParams?.detail]);

  const getNombre = id => cuentas.find(c => c.id === id)?.razon_social || id;
  const query = searchQuery.toLowerCase();

  const BADGE = { activa:'badge-green', en_ejecucion:'badge-green', en_pausa:'badge-orange', cerrada:'badge-gray', facturada:'badge-gray', por_facturar:'badge-cyan', anulada:'badge-red' };
  const LABEL = { activa:'Activa', en_ejecucion:'Activa', en_pausa:'En pausa', cerrada:'Cerrada', facturada:'Cerrada', por_facturar:'Pendiente', anulada:'Anulada' };

  const clientesConOS = useMemo(() => [...new Set(osClientes.map(o => o.cuenta_id).filter(Boolean))].map(id => ({ id, nombre: getNombre(id) })), [osClientes, cuentas]);

  const filtered = useMemo(() => osClientes.filter(os => {
    const matchQ = (os.numero || '').toLowerCase().includes(query) ||
      (os.nombre || '').toLowerCase().includes(query) ||
      (os.numero_doc_cliente || '').toLowerCase().includes(query) ||
      getNombre(os.cuenta_id).toLowerCase().includes(query);
    return matchQ &&
      (!filtroEstado || os.estado === filtroEstado) &&
      (!filtroCliente || os.cuenta_id === filtroCliente);
  }), [osClientes, query, filtroEstado, filtroCliente, cuentas]);

  if (activeParams?.detail) {
    const os = osClientes.find(o => o.id === activeParams.detail);
    if (!os) return <div className="p-4">OS no encontrada</div>;

    if (activeParams?.crear_ot) {
      return (
        <FormCrearMultiplesOTs
          os={os}
          onCancel={() => navigate('os_cliente', { detail: os.id })}
        />
      );
    }

    const osOts  = ots.filter(ot => ot.os_cliente_id === os.id || (os.ots_asociadas || []).includes(ot.id));
    const totalEstimadoOTs = osOts.reduce((s, o) => s + Number(o.costoEst || o.costo_estimado || 0), 0);
    const totalRealOTs = osOts.reduce((s, o) => s + calcCostoRealLiveOS(o), 0);
    const osCotz = cotizaciones.filter(c => c.os_cliente_id === os.id || c.id === os.cotizacion_id);
    const osVals = valorizaciones.filter(v => v.os_cliente_id === os.id);
    const valIds = new Set(osVals.map(v => v.id));
    const osFacts = facturas.filter(f => f.valorizacion_id && valIds.has(f.valorizacion_id));
    const osCxc   = cxc.filter(c => osFacts.some(f => f.id === c.factura_id));

    const totalAprobado = osCotz.length > 0
      ? osCotz.reduce((s, c) => s + Number(c.total_impl || c.total || 0), 0)
      : Number(os.monto_aprobado || 0);
    const ejecutado  = osOts.filter(ot => ['cerrada_tecnica','cerrada','facturada'].includes(ot.estado)).reduce((s, ot) => s + Number(ot.costo_real || 0), 0);
    const valorizado = osVals.reduce((s, v) => s + Number(v.total || 0), 0);
    const facturado  = Number(os.monto_facturado || 0);
    const pendiente  = Math.max(0, totalAprobado - facturado);
    const margenEst  = totalAprobado > 0 ? Math.round((totalAprobado - ejecutado) / totalAprobado * 100) : 0;

    const hitos = os.hitos_facturacion || [];
    const handleAddHito = hito => {
      actualizarHitosFacturacion(os.id, [...hitos, { id: Date.now().toString(), numero: hitos.length + 1, ...hito, estado: 'pendiente' }]);
      setNuevoHito(null);
    };
    const handleDelHito = id => actualizarHitosFacturacion(os.id, hitos.filter(h => h.id !== id));
    const handleHitoEstado = (id, estado) => actualizarHitosFacturacion(os.id, hitos.map(h => h.id === id ? { ...h, estado } : h));
    const handleHitoFecha = (id, fecha) => actualizarHitosFacturacion(os.id, hitos.map(h => h.id === id ? { ...h, fecha_esperada: fecha } : h));
    const handleHitoFactura = (id, facturaId) => actualizarHitosFacturacion(os.id, hitos.map(h => h.id === id ? { ...h, factura_id: facturaId || null } : h));
    const hitosImportables = osCotz.filter(c => c.hitos_activos && c.hitos_pago?.length > 0).flatMap(c => c.hitos_pago);
    const handleImportarHitos = () => {
      const nuevos = hitosImportables.map((h, i) => ({ id: `${Date.now()}_${i}`, numero: hitos.length + i + 1, concepto: h.concepto, monto: h.monto || 0, fecha_esperada: '', estado: 'pendiente' }));
      actualizarHitosFacturacion(os.id, [...hitos, ...nuevos]);
    };

    const cotsDisponibles = cotizaciones.filter(c => c.cuenta_id === os.cuenta_id && c.estado === 'aprobada' && c.id !== os.cotizacion_id && !c.os_cliente_id);
    const tabs = ['Cotizaciones', 'OTs', 'Valorizaciones', 'Facturas', 'Historial'];
    const activeTab = activeParams.tab || 'OTs';
    const cerrada = ['cerrada', 'anulada'].includes(os.estado);

    const historial = [
      { fecha: os.created_at?.slice(0, 10), desc: `OS creada: ${os.numero}` },
      ...osCotz.map(c => ({ fecha: c.fecha, desc: `Cotización vinculada: ${c.numero} — ${moneyCurrency(c.total_impl || c.total, c.moneda)}` })),
      ...osOts.map(ot => ({ fecha: ot.fecha_programada || ot.created_at?.slice(0,10), desc: `OT creada: ${ot.numero}${ot.servicio ? ` — ${ot.servicio}` : ''}` })),
      ...osVals.map(v => ({ fecha: v.fecha, desc: `Valorización: ${v.numero || v.id?.slice(0,8)} — ${money(v.total)}` })),
      ...osFacts.map(f => ({ fecha: f.fecha_emision, desc: `Factura emitida: ${f.numero} — ${money(f.total)}` })),
    ].filter(e => e.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha));

    return (
      <>
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={() => navigate('os_cliente')} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
            <h1 className="page-title row" style={{gap:10, flexWrap:'wrap'}}>
              {os.nombre || os.numero}
              <span className={'badge ' + (BADGE[os.estado] || 'badge-gray')} style={{fontSize:12}}>{LABEL[os.estado] || os.estado}</span>
              <span className="badge badge-gray" style={{fontSize:11}}>{os.moneda}</span>
            </h1>
            <div className="page-sub" style={{flexWrap:'wrap', gap:6, alignItems:'center'}}>
              {os.numero} · Cliente: <strong style={{color:'var(--fg)'}}>{getNombre(os.cuenta_id)}</strong>
              {os.responsable_comercial && <> · {os.responsable_comercial}</>}
              {editandoNumCliente ? (
                <span className="row" style={{gap:4, alignItems:'center', marginLeft:4}}>
                  <span style={{color:'var(--fg-muted)'}}>· Nº OS cliente:</span>
                  <input
                    className="input"
                    style={{fontSize:12, padding:'2px 8px', height:'auto', width:180}}
                    value={numClienteTemp}
                    onChange={e => setNumClienteTemp(e.target.value)}
                    placeholder="Ej. OS-2026-001"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') { actualizarOSCliente(os.id, { numero_doc_cliente: numClienteTemp.trim() || null }); setEditandoNumCliente(false); }
                      if (e.key === 'Escape') setEditandoNumCliente(false);
                    }}
                  />
                  <button className="btn btn-primary" style={{fontSize:11, padding:'2px 10px', height:'auto'}}
                    onClick={() => { actualizarOSCliente(os.id, { numero_doc_cliente: numClienteTemp.trim() || null }); setEditandoNumCliente(false); }}>
                    Guardar
                  </button>
                  <button className="btn btn-ghost" style={{fontSize:11, padding:'2px 8px', height:'auto'}}
                    onClick={() => setEditandoNumCliente(false)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <span className="row" style={{gap:4, alignItems:'center', marginLeft:4}}>
                  {os.numero_doc_cliente
                    ? <> · Nº OS cliente: <strong>{os.numero_doc_cliente}</strong></>
                    : <span style={{color:'var(--fg-muted)', fontSize:12}}>· Sin Nº OS cliente</span>
                  }
                  {!cerrada && (
                    <button className="btn btn-ghost" style={{fontSize:11, padding:'1px 6px', height:'auto', marginLeft:2}}
                      onClick={() => { setNumClienteTemp(os.numero_doc_cliente || ''); setEditandoNumCliente(true); }}>
                      ✏
                    </button>
                  )}
                </span>
              )}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
              <span style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>CEBE:</span>
              {!cerrada ? (
                <select
                  className="select"
                  style={{fontSize:12, padding:'3px 8px', height:'auto', width:'auto', minWidth:200}}
                  value={os.centro_beneficio_id || ''}
                  onChange={e => actualizarOSCliente(os.id, { centro_beneficio_id: e.target.value || null })}
                >
                  <option value="">— Sin CEBE asignado —</option>
                  {(centrosBeneficio || []).filter(c => c.estado === 'activo').map(c => (
                    <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} – ` : ''}{c.nombre}</option>
                  ))}
                </select>
              ) : (
                <span style={{fontSize:12}}>
                  {(centrosBeneficio || []).find(c => c.id === os.centro_beneficio_id)?.nombre || <em style={{color:'var(--fg-muted)'}}>Sin asignar</em>}
                </span>
              )}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
              <span style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>Nombre OS:</span>
              {!cerrada && editandoNombre ? (
                <>
                  <input
                    className="input"
                    style={{fontSize:12, padding:'3px 8px', height:'auto', minWidth:260}}
                    value={nombreTemp}
                    onChange={e => setNombreTemp(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') { actualizarOSCliente(os.id, { nombre: nombreTemp.trim() || null }); setEditandoNombre(false); }
                      if (e.key === 'Escape') setEditandoNombre(false);
                    }}
                  />
                  <button className="btn btn-primary" style={{fontSize:11, padding:'2px 10px', height:'auto'}}
                    onClick={() => { actualizarOSCliente(os.id, { nombre: nombreTemp.trim() || null }); setEditandoNombre(false); }}>
                    Guardar
                  </button>
                  <button className="btn btn-ghost" style={{fontSize:11, padding:'2px 8px', height:'auto'}}
                    onClick={() => setEditandoNombre(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{fontSize:12}}>{os.nombre || <em style={{color:'var(--fg-muted)'}}>Sin nombre</em>}</span>
                  {!cerrada && (
                    <button className="btn btn-ghost" style={{fontSize:11, padding:'1px 6px', height:'auto'}}
                      onClick={() => { setNombreTemp(os.nombre || ''); setEditandoNombre(true); }}>
                      ✏
                    </button>
                  )}
                </>
              )}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
              <span style={{fontSize:12, color:'var(--fg-muted)', fontWeight:600}}>Responsable:</span>
              {!cerrada ? (
                <select
                  className="select"
                  style={{fontSize:12, padding:'3px 8px', height:'auto', width:'auto', minWidth:200}}
                  value={os.responsable_comercial_id || ''}
                  onChange={e => {
                    const u = (usuarios || []).find(u => u.id === e.target.value);
                    actualizarOSCliente(os.id, {
                      responsable_comercial_id: e.target.value || null,
                      responsable_comercial: u?.nombre || null,
                    });
                  }}
                >
                  <option value="">— Sin asignar —</option>
                  {(usuarios || []).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              ) : (
                <span style={{fontSize:12}}>
                  {os.responsable_comercial || <em style={{color:'var(--fg-muted)'}}>Sin asignar</em>}
                </span>
              )}
            </div>
          </div>
          <div className="row" style={{gap:8, flexWrap:'wrap', alignSelf:'flex-start'}}>
            {os.cotizacion_id && <button className="btn btn-secondary" onClick={() => navigate('cotizaciones', { detail: os.cotizacion_id })}>{I.file} Ver cotización</button>}
            {!cerrada && <>
              {os.estado !== 'en_pausa' && <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setModalEstado({ tipo: 'en_pausa' })}>Pausar</button>}
              {os.estado === 'en_pausa' && <button className="btn btn-secondary" style={{fontSize:12}} onClick={async () => { setSaving(true); await cambiarEstadoOS(os.id, 'activa', ''); setSaving(false); }}>Reactivar</button>}
              <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setModalEstado({ tipo: 'cerrada' })}>Cerrar OS</button>
              <button className="btn btn-secondary" style={{fontSize:12, color:'var(--danger)'}} onClick={() => setModalEstado({ tipo: 'anulada' })}>Anular</button>
              <button className="btn btn-primary" data-local-form="true" onClick={() => navigate('os_cliente', { detail: os.id, crear_ot: true })}>{I.plus} Crear OT</button>
            </>}
          </div>
        </div>

        <div style={{padding:'16px 32px 0'}}>
          <div className="grid-3" style={{gap:12, marginBottom:16}}>
            <div className="kpi-card">
              <div className="kpi-label">Total aprobado</div>
              <div className="kpi-value">{moneyCurrency(totalAprobado, os.moneda)}</div>
              <div className="text-muted" style={{fontSize:11}}>{osCotz.length} cotización(es)</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Ejecutado</div>
              <div className="kpi-value">{moneyCurrency(ejecutado, os.moneda)}</div>
              <div className="text-muted" style={{fontSize:11}}>Saldo ejec.: {moneyCurrency(os.saldo_por_ejecutar || 0, os.moneda)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Valorizado</div>
              <div className="kpi-value">{moneyCurrency(valorizado, os.moneda)}</div>
              <div className="text-muted" style={{fontSize:11}}>
                {osVals.length} valorización(es)
                {Number(os.saldo_por_valorizar || 0) > 0 && (
                  <span style={{color:'var(--orange)', marginLeft:6}}>· Saldo: {moneyCurrency(os.saldo_por_valorizar, os.moneda)}</span>
                )}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Facturado</div>
              <div className="kpi-value">{moneyCurrency(facturado, os.moneda)}</div>
              <div className="text-muted" style={{fontSize:11}}>Cobrado: {moneyCurrency(os.monto_cobrado || 0, os.moneda)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Pendiente de facturar</div>
              <div className="kpi-value" style={{color: pendiente > 0 ? 'var(--orange)' : 'var(--green)'}}>{moneyCurrency(pendiente, os.moneda)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Margen estimado</div>
              <div className="kpi-value" style={{color: margenEst >= 20 ? 'var(--green)' : margenEst >= 0 ? 'var(--orange)' : 'var(--danger)'}}>{margenEst}%</div>
              <div className="text-muted" style={{fontSize:11}}>vs ejecutado</div>
            </div>
          </div>

          <div className="card" style={{marginBottom:16}}>
            <div className="card-head" style={{justifyContent:'space-between'}}>
              <h3><span style={{width:16,height:16,display:'inline-flex',verticalAlign:'middle',marginRight:6}}>{I.calendar}</span>Calendario de facturación</h3>
              {!cerrada && <div className="row" style={{gap:8}}>
                {hitosImportables.length > 0 && <button className="btn btn-secondary" style={{fontSize:12}} onClick={handleImportarHitos}>↓ Importar desde cotización</button>}
                <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setNuevoHito({})}>+ Agregar hito</button>
              </div>}
            </div>
            {hitos.length === 0
              ? <div className="card-body" style={{textAlign:'center', color:'var(--fg-muted)', fontSize:13}}>
                  {hitosImportables.length > 0 ? 'La cotización tiene hitos de pago — usa "Importar desde cotización" para cargarlos.' : 'Sin hitos definidos. Agrégalos manualmente o se importarán desde cotizaciones con calendario de pago.'}
                </div>
              : <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>N°</th><th>Concepto</th><th>Monto</th><th>Fecha esperada</th><th>Factura</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {hitos.map(h => (
                        <tr key={h.id}>
                          <td className="mono">{h.numero}</td>
                          <td>{h.concepto}</td>
                          <td className="num">{moneyCurrency(h.monto || 0, os.moneda)}</td>
                          <td>
                            <input type="date" className="input" style={{fontSize:12, padding:'2px 6px', height:'auto', minWidth:130}} value={h.fecha_esperada || ''} onChange={e => handleHitoFecha(h.id, e.target.value)} disabled={cerrada} />
                          </td>
                          <td>
                            <select className="select" style={{fontSize:12, padding:'2px 8px', height:'auto', minWidth:120}} value={h.factura_id || ''} onChange={e => handleHitoFactura(h.id, e.target.value)} disabled={cerrada}>
                              <option value="">Sin vincular</option>
                              {osFacts.map(f => <option key={f.id} value={f.id}>{f.numero} — {moneyCurrency(f.total || 0, os.moneda)}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="select" style={{fontSize:12, padding:'2px 8px', height:'auto'}} value={h.estado} onChange={e => handleHitoEstado(h.id, e.target.value)} disabled={cerrada}>
                              <option value="pendiente">Pendiente</option>
                              <option value="facturado">Facturado</option>
                              <option value="cobrado">Cobrado</option>
                            </select>
                          </td>
                          <td>{!cerrada && <button className="icon-btn" onClick={() => handleDelHito(h.id)} style={{color:'var(--danger)'}}>×</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        </div>

        <div className="tabs os-detail-tabs ficha-detail-tabs" style={{padding:'0 32px'}}>
          {tabs.map(t => (
            <button key={t} className={`tab ficha-detail-tab ${activeTab===t?'active':''}`} onClick={() => navigate('os_cliente', { detail: os.id, tab: t })}>
              {t}
            </button>
          ))}
        </div>

        <div className="os-detail-content" style={{padding:'16px 32px 40px'}}>
          <div className="card os-detail-panel">

            {activeTab === 'Cotizaciones' && <>
              <div className="card-head" style={{justifyContent:'space-between'}}>
                <h3>Cotizaciones vinculadas</h3>
                {cotsDisponibles.length > 0 && <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => setVinCotModal(true)}>+ Vincular cotización</button>}
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Número</th><th>Ver.</th><th>Fecha</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {osCotz.map(c => (
                      <tr key={c.id} className="hover-row" onClick={() => navigate('cotizaciones', { detail: c.id })} style={{cursor:'pointer'}}>
                        <td className="mono" style={{fontWeight:600}}>{c.numero}</td>
                        <td>v{c.version || 1}</td>
                        <td>{c.fecha}</td>
                        <td className="num">{moneyCurrency(c.total_impl || c.total, c.moneda)}</td>
                        <td><span className={'badge ' + (c.estado==='aprobada'?'badge-green':c.estado==='convertida'?'badge-navy':'badge-gray')}>{c.estado}</span></td>
                        <td><button className="icon-btn">{I.chev}</button></td>
                      </tr>
                    ))}
                    {osCotz.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:32, color:'var(--fg-muted)'}}>Sin cotizaciones vinculadas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>}

            {activeTab === 'OTs' && <>
              <div className="card-head" style={{justifyContent:'space-between'}}>
                <h3>Órdenes de Trabajo</h3>
                {!cerrada && <button className="btn btn-primary os-local-action" style={{fontSize:12}} data-local-form="true" onClick={() => navigate('os_cliente', { detail: os.id, crear_ot: true })}>{I.plus} Nueva OT</button>}
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>OT</th><th>Servicio</th><th>Fecha</th><th className="num">Monto est.</th><th className="num">Costo real</th><th>Avance</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {osOts.map(ot => (
                      <tr key={ot.id} className="hover-row" onClick={() => navigate('ot', { detail: ot.id })} style={{cursor:'pointer'}}>
                        <td className="mono" style={{fontWeight:600}}>{ot.numero}</td>
                        <td>{ot.tipo || ot.servicio}</td>
                        <td>{ot.fecha_inicio || ot.fecha_programada || '-'}</td>
                        <td className="num">{moneyCurrency(ot.costoEst || ot.costo_estimado || 0, os.moneda)}</td>
                        <td className="num">{moneyCurrency(calcCostoRealLiveOS(ot), os.moneda)}</td>
                        <td>{ot.avance || ot.avance_pct || 0}%</td>
                        <td>
                          <span className="badge badge-cyan">{(ot.estado || 'programada').replace('_', ' ')}</span>
                          {ot.es_adicional && <span className="badge badge-orange" style={{marginLeft:4}}>Adicional</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()} style={{display:'flex', gap:4, alignItems:'center'}}>
                          <button className="btn btn-secondary" style={{fontSize:11, padding:'2px 8px'}}
                            onClick={() => navigate('ot', { detail: ot.id })}>
                            Editar
                          </button>
                          {['borrador','programada'].includes(ot.estado) && !cerrada && (<>
                            <button className="btn btn-secondary" style={{fontSize:11, padding:'2px 8px', color:'var(--fg-muted)'}}
                              onClick={() => { if (window.confirm(`¿Desvincular ${ot.numero} de esta OS?`)) actualizarOT(ot.id, { os_cliente_id: null }); }}>
                              Desvincular
                            </button>
                            <button className="btn btn-secondary" style={{fontSize:11, padding:'2px 8px', color:'var(--danger)'}}
                              onClick={() => { if (window.confirm(`¿Eliminar ${ot.numero}? Esta acción no se puede deshacer.`)) eliminarOT(ot.id); }}>
                              Eliminar
                            </button>
                          </>)}
                        </td>
                      </tr>
                    ))}
                    {osOts.length === 0 && <tr><td colSpan="8" style={{textAlign:'center', padding:32, color:'var(--fg-muted)'}}>Sin OTs vinculadas. Créalas con el botón "Crear OT".</td></tr>}
                  </tbody>
                  {osOts.length > 0 && (
                    <tfoot>
                      <tr style={{background:'var(--bg-subtle)', fontWeight:600, fontSize:12}}>
                        <td colSpan="3" style={{padding:'8px 12px', textAlign:'right', color:'var(--fg-muted)'}}>Totales</td>
                        <td className="num">{moneyCurrency(totalEstimadoOTs, os.moneda)}</td>
                        <td className="num">{moneyCurrency(totalRealOTs, os.moneda)}</td>
                        <td></td>
                        <td colSpan="2" style={{padding:'8px 12px', fontSize:11, color:'var(--fg-muted)'}}>Presupuesto OS: <strong>{moneyCurrency(totalAprobado, os.moneda)}</strong></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>}

            {activeTab === 'Valorizaciones' && <>
              <div className="card-head" style={{justifyContent:'space-between'}}>
                <h3>Valorizaciones</h3>
                {!cerrada && <button className="btn btn-secondary" style={{fontSize:12}} onClick={() => navigate('valorizacion')}>+ Nueva valorización</button>}
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>N°</th><th>Período</th><th>Monto</th><th>Estado</th></tr></thead>
                  <tbody>
                    {osVals.map(v => (
                      <tr key={v.id}>
                        <td className="mono">{v.numero || v.id?.slice(0, 8)}</td>
                        <td>{v.periodo || v.fecha}</td>
                        <td className="num">{money(v.total || 0)}</td>
                        <td><span className={'badge ' + (v.estado==='facturada'?'badge-green':v.estado==='aprobada'?'badge-cyan':'badge-gray')}>{v.estado || 'borrador'}</span></td>
                      </tr>
                    ))}
                    {osVals.length === 0 && <tr><td colSpan="4" style={{textAlign:'center', padding:32, color:'var(--fg-muted)'}}>Sin valorizaciones. Se generan desde el módulo Valorización.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>}

            {activeTab === 'Facturas' && <>
              <div className="card-head"><h3>Facturas emitidas</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Número</th><th>Fecha</th><th>Monto</th><th>Estado cobro</th></tr></thead>
                  <tbody>
                    {osFacts.map(f => {
                      const cobro = osCxc.find(c => c.factura_id === f.id);
                      return (
                        <tr key={f.id}>
                          <td className="mono">{f.numero}</td>
                          <td>{f.fecha_emision}</td>
                          <td className="num">{money(f.total || 0)}</td>
                          <td><span className={'badge ' + (cobro?.estado==='pagado'?'badge-green':cobro?.estado==='por_cobrar'?'badge-orange':'badge-gray')}>{cobro?.estado || f.estado || '-'}</span></td>
                        </tr>
                      );
                    })}
                    {osFacts.length === 0 && <tr><td colSpan="4" style={{textAlign:'center', padding:32, color:'var(--fg-muted)'}}>Sin facturas. Se generan desde Valorizaciones.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>}

            {activeTab === 'Historial' && <>
              <div className="card-head"><h3>Historial de eventos</h3></div>
              <div className="card-body">
                {historial.length === 0
                  ? <div style={{textAlign:'center', color:'var(--fg-muted)', padding:24}}>Sin eventos registrados.</div>
                  : <div className="col" style={{gap:0}}>
                      {historial.map((e, i) => (
                        <div key={i} style={{display:'flex', gap:12, padding:'10px 0', borderBottom: i < historial.length - 1 ? '1px solid var(--border)' : 'none'}}>
                          <div style={{width:84, flexShrink:0, fontSize:12, color:'var(--fg-muted)'}}>{e.fecha}</div>
                          <div style={{fontSize:13}}>{e.desc}</div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </>}

          </div>
        </div>

        {modalEstado && (
          <CambiarEstadoOSModal
            os={os} tipo={modalEstado.tipo}
            onClose={() => setModalEstado(null)}
            saving={saving}
            onConfirm={async (motivo) => {
              setSaving(true);
              const ok = await cambiarEstadoOS(os.id, modalEstado.tipo, motivo);
              setSaving(false);
              if (ok) setModalEstado(null);
            }}
          />
        )}

        {vinCotModal && (
          <div className="modal-backdrop">
            <div className="modal" style={{maxWidth:500}}>
              <div className="modal-head">
                <h2>Vincular cotización aprobada</h2>
                <button className="icon-btn" onClick={() => setVinCotModal(false)}>{I.x}</button>
              </div>
              <div className="modal-body col" style={{gap:10}}>
                <div style={{fontSize:13, color:'var(--fg-muted)'}}>Cotizaciones aprobadas del mismo cliente sin OS asignada:</div>
                {cotsDisponibles.map(c => (
                  <div key={c.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', border:'1px solid var(--border)', borderRadius:8}}>
                    <div>
                      <div style={{fontWeight:600}}>{c.numero}</div>
                      <div style={{fontSize:12, color:'var(--fg-muted)'}}>{c.fecha} · {moneyCurrency(c.total_impl || c.total, c.moneda)}</div>
                    </div>
                    <button className="btn btn-primary" style={{fontSize:12}} onClick={async () => { await vincularCotizacionOS(c.id, os.id); setVinCotModal(false); }}>Vincular</button>
                  </div>
                ))}
              </div>
              <div className="modal-foot">
                <button className="btn btn-secondary" onClick={() => setVinCotModal(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {nuevoHito !== null && (
          <NuevoHitoModal moneda={os.moneda} onClose={() => setNuevoHito(null)} onSave={handleAddHito} />
        )}
      </>
    );
  }

  const osActivas = osClientes.filter(o => ['activa', 'en_ejecucion'].includes(o.estado));
  const totalesPorMoneda = osActivas.reduce((acc, o) => { const m = o.moneda || 'PEN'; acc[m] = (acc[m] || 0) + Number(o.monto_aprobado || 0); return acc; }, {});
  const pendientesPorMoneda = osActivas.reduce((acc, o) => { const m = o.moneda || 'PEN'; acc[m] = (acc[m] || 0) + Number(o.saldo_por_facturar || 0); return acc; }, {});

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes de Servicio Cliente</h1>
          <div className="page-sub">Contratos aprobados y su ejecución</div>
        </div>
      </div>

      <div style={{padding:'0 32px 16px'}}>
        <div className="grid-3" style={{gap:12}}>
          <div className="kpi-card">
            <div className="kpi-label">OS activas</div>
            <div className="kpi-value">{osActivas.length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Monto total aprobado</div>
            <div className="kpi-value" style={{fontSize: Object.keys(totalesPorMoneda).length > 1 ? 22 : undefined}}>
              {Object.entries(totalesPorMoneda).map(([m, v]) => <div key={m}>{moneyCurrency(v, m)}</div>)}
              {Object.keys(totalesPorMoneda).length === 0 && moneyCurrency(0)}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Pendiente de facturar</div>
            <div className="kpi-value" style={{color:'var(--orange)', fontSize: Object.keys(pendientesPorMoneda).length > 1 ? 22 : undefined}}>
              {Object.entries(pendientesPorMoneda).map(([m, v]) => <div key={m}>{moneyCurrency(v, m)}</div>)}
              {Object.keys(pendientesPorMoneda).length === 0 && moneyCurrency(0)}
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'0 32px 12px', display:'flex', gap:10, flexWrap:'wrap'}}>
        <select className="select" style={{width:'auto', minWidth:170}} value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientesConOS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{width:'auto', minWidth:140}} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activa">Activa</option>
          <option value="en_ejecucion">Activa (legacy)</option>
          <option value="en_pausa">En pausa</option>
          <option value="cerrada">Cerrada</option>
          <option value="anulada">Anulada</option>
        </select>
      </div>

      <div className="card" style={{margin:'0 32px'}}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° OS</th>
                <th>N° Cliente</th>
                <th>Nombre</th>
                <th>Cliente</th>
                <th>Responsable</th>
                <th>Total aprobado</th>
                <th>Facturado</th>
                <th>Pendiente</th>
                <th>Estado</th>
                <th>Cierre est.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(os => (
                <tr key={os.id} className="hover-row" onClick={() => navigate('os_cliente', { detail: os.id })} style={{cursor:'pointer'}}>
                  <td className="mono" style={{fontWeight:600}}>{os.numero}</td>
                  <td className="mono text-muted">{os.numero_doc_cliente || '-'}</td>
                  <td style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{os.nombre || '-'}</td>
                  <td>{getNombre(os.cuenta_id)}</td>
                  <td className="text-muted">{os.responsable_comercial || '-'}</td>
                  <td className="num" style={{fontWeight:600}}>{moneyCurrency(os.monto_aprobado || 0, os.moneda)}</td>
                  <td className="num">{moneyCurrency(os.monto_facturado || 0, os.moneda)}</td>
                  <td className="num" style={{color:'var(--orange)'}}>{moneyCurrency(os.saldo_por_facturar || 0, os.moneda)}</td>
                  <td><span className={'badge ' + (BADGE[os.estado] || 'badge-gray')}>{LABEL[os.estado] || os.estado}</span></td>
                  <td className="text-muted">{os.fecha_fin || '-'}</td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="11" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{osClientes.length === 0 ? 'No hay OS Cliente registradas.' : 'Sin resultados para los filtros seleccionados.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Marketing() {
  const { campanas, crearCampana, actualizarCampana, cambiarEstadoCampana, eliminarCampana, leads, oportunidades, empresa, monedasActivas } = useApp();
  const [tab, setTab] = useState('campanas');
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const TIPOS = ['ads', 'email', 'evento', 'outbound', 'contenido', 'referidos'];
  const CANALES = ['Google Ads', 'LinkedIn', 'Email', 'WhatsApp', 'Evento', 'Campo', 'Otro'];
  const ESTADOS_LABEL = { borrador: 'Borrador', activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada' };
  const estadoBadge = { borrador: 'badge-gray', activa: 'badge-green', pausada: 'badge-orange', finalizada: 'badge-cyan' };

  const formBase = { nombre: '', tipo: 'ads', canal: 'Google Ads', fecha_inicio: '', fecha_fin: '', presupuesto: '', moneda: empresa?.moneda || 'PEN', estado: 'borrador', descripcion: '' };
  const [form, setForm] = useState(formBase);
  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const metricas = (camp) => {
    const lg = leads.filter(l => l.campana_id === camp.id);
    const lc = lg.filter(l => l.convertido);
    const og = oportunidades.filter(o => o.campana_id === camp.id && o.estado === 'ganada');
    const ing = og.reduce((s, o) => s + (o.monto_estimado || 0), 0);
    const p = camp.presupuesto || 0;
    return {
      leadsGen: lg.length, leadsConv: lc.length, oppsGanadas: og.length,
      ingresoAtribuido: ing,
      cpl: lg.length > 0 ? p / lg.length : 0,
      costoVenta: og.length > 0 ? p / og.length : 0,
      roi: p > 0 ? (ing - p) / p * 100 : 0,
      tasaConv: lg.length > 0 ? lc.length / lg.length * 100 : 0,
    };
  };

  const campActivas = campanas.filter(c => c.estado === 'activa').length;
  const totalLeadsAtrib = leads.filter(l => l.campana_id).length;
  const presupuestoTotal = campanas.reduce((s, c) => s + (c.presupuesto || 0), 0);
  const ingAtribTotal = oportunidades.filter(o => o.campana_id && o.estado === 'ganada').reduce((s, o) => s + (o.monto_estimado || 0), 0);
  const roiGlobal = presupuestoTotal > 0 ? ((ingAtribTotal - presupuestoTotal) / presupuestoTotal * 100).toFixed(0) : null;

  const abrirNuevo = () => { setForm(formBase); setFormError(''); setPanelNuevo(true); setEditando(null); setDetalle(null); };
  const abrirEditar = (c) => { setForm({ nombre: c.nombre, tipo: c.tipo, canal: c.canal, fecha_inicio: c.fecha_inicio || '', fecha_fin: c.fecha_fin || '', presupuesto: c.presupuesto || '', moneda: c.moneda || 'PEN', estado: c.estado, descripcion: c.descripcion || '' }); setFormError(''); setEditando(c); setPanelNuevo(false); setDetalle(null); };
  const cerrar = () => { setPanelNuevo(false); setEditando(null); setFormError(''); };

  const confirmarEliminar = async (c) => {
    if (!c?.id) return;
    const ok = window.confirm(`Eliminar campaña "${c.nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await eliminarCampana(c.id);
      if (detalle?.id === c.id) setDetalle(null);
      if (editando?.id === c.id) cerrar();
    } catch (_) { /* notificación ya mostrada en context */ }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    const datos = { ...form, presupuesto: Number(form.presupuesto) || 0 };
    setFormError('');
    setSaving(true);
    try {
      if (editando) await actualizarCampana(editando.id, datos);
      else await crearCampana(datos);
      cerrar();
    } catch (err) {
      setFormError(err?.message || 'No se pudo guardar la campana.');
    }
    finally { setSaving(false); }
  };

  const panelOpen = panelNuevo || !!editando;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Marketing Automation</h1><div className="page-sub">Campañas, atribución de leads y ROI por canal</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={abrirNuevo}>{I.plus} Nueva campaña</button>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Campañas activas</div><div className="kpi-value">{campActivas}</div><div className="kpi-icon green">{I.target}</div></div>
        <div className="kpi-card"><div className="kpi-label">Leads atribuidos</div><div className="kpi-value">{totalLeadsAtrib}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Presupuesto total</div><div className="kpi-value" style={{fontSize:18}}>{money(presupuestoTotal)}</div><div className="kpi-icon orange">{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">ROI global</div><div className="kpi-value" style={{color: roiGlobal !== null ? (Number(roiGlobal) > 0 ? 'var(--green)' : 'var(--danger)') : 'var(--fg-muted)'}}>{roiGlobal !== null ? roiGlobal + '%' : '—'}</div><div className="kpi-icon purple">{I.trend}</div></div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='campanas'?'active':'')} onClick={()=>setTab('campanas')}>Campañas</div>
        <div className={'tab '+(tab==='rendimiento'?'active':'')} onClick={()=>setTab('rendimiento')}>Rendimiento por campaña</div>
      </div>

      <div style={{display:'grid', gridTemplateColumns: detalle && !panelOpen ? '1fr 380px' : '1fr', gap:20, alignItems:'start'}}>
        <div>
          {tab === 'campanas' && (
            <div className="card">
              <div className="card-head"><h3>Todas las campañas</h3><span className="badge badge-gray">{campanas.length}</span></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Nombre</th><th>Tipo · Canal</th><th>Período</th><th className="num">Presupuesto</th><th>Leads</th><th>Conv.</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {campanas.map(c => {
                      const m = metricas(c);
                      return (
                        <tr key={c.id} className="hover-row" onClick={() => { setDetalle(c); cerrar(); }} style={{cursor:'pointer'}}>
                          <td><div style={{fontWeight:600,fontSize:13}}>{c.nombre}</div><div className="text-muted" style={{fontSize:11}}>{c.descripcion?.slice(0,55)}{(c.descripcion?.length||0)>55?'…':''}</div></td>
                          <td><span className="badge badge-gray" style={{fontSize:11,textTransform:'capitalize'}}>{c.tipo}</span><span style={{marginLeft:6,fontSize:11,color:'var(--fg-muted)'}}>{c.canal}</span></td>
                          <td className="text-muted" style={{fontSize:12}}>{c.fecha_inicio}{c.fecha_fin ? ' → '+c.fecha_fin : ''}</td>
                          <td className="num">{money(c.presupuesto)}</td>
                          <td style={{fontWeight:700}}>{m.leadsGen}</td>
                          <td><span style={{fontSize:12,fontWeight:600,color:m.tasaConv>20?'var(--green)':'var(--fg)'}}>{m.tasaConv.toFixed(0)}%</span></td>
                          <td><span className={'badge '+estadoBadge[c.estado]} style={{textTransform:'capitalize'}}>{ESTADOS_LABEL[c.estado]}</span></td>
                          <td onClick={e=>e.stopPropagation()}>
                            <div className="row" style={{gap:6}}>
                              <button className="btn btn-sm btn-secondary" onClick={()=>abrirEditar(c)}>Editar</button>
                              {c.estado==='borrador'&&<button className="btn btn-sm btn-primary" onClick={()=>cambiarEstadoCampana(c.id,'activa')}>Activar</button>}
                              {c.estado==='activa'&&<button className="btn btn-sm btn-secondary" onClick={()=>cambiarEstadoCampana(c.id,'pausada')}>Pausar</button>}
                              {c.estado==='pausada'&&<button className="btn btn-sm btn-primary" onClick={()=>cambiarEstadoCampana(c.id,'activa')}>Reactivar</button>}
                              <button className="icon-btn" title="Eliminar campana" style={{color:'var(--danger)'}} onClick={()=>confirmarEliminar(c)}>{I.trash}</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!campanas.length && <tr><td colSpan={8} className="text-muted" style={{textAlign:'center',padding:32}}>Sin campañas. Crea la primera con "Nueva campaña".</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'rendimiento' && (
            <div style={{display:'grid',gap:20}}>
              {campanas.map(c => {
                const m = metricas(c);
                return (
                  <div key={c.id} className="card">
                    <div className="card-head">
                      <div><div style={{fontWeight:700,fontSize:14}}>{c.nombre}</div><div className="text-muted" style={{fontSize:11}}>{c.canal} · {c.fecha_inicio}{c.fecha_fin?' → '+c.fecha_fin:''}</div></div>
                      <span className={'badge '+estadoBadge[c.estado]}>{ESTADOS_LABEL[c.estado]}</span>
                    </div>
                    <div style={{padding:'16px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,borderBottom:'1px solid var(--border)'}}>
                      {[{l:'Leads generados',v:m.leadsGen,col:'var(--cyan)'},{l:'Convertidos',v:m.leadsConv,col:'var(--green)'},{l:'Ops ganadas',v:m.oppsGanadas,col:'var(--purple)'},{l:'Tasa conv.',v:m.tasaConv.toFixed(0)+'%',col:'var(--orange)'}].map(({l,v,col})=>(
                        <div key={l} style={{textAlign:'center'}}><div style={{fontSize:24,fontWeight:800,color:col}}>{v}</div><div style={{fontSize:11,color:'var(--fg-muted)',marginTop:2}}>{l}</div></div>
                      ))}
                    </div>
                    <div style={{padding:'16px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                      {[{l:'Ingreso atribuido',v:money(m.ingresoAtribuido),col:m.ingresoAtribuido>0?'var(--green)':'var(--fg)'},{l:'Costo por lead',v:m.leadsGen>0?money(m.cpl):'—',col:'var(--fg)'},{l:'Costo por venta',v:m.oppsGanadas>0?money(m.costoVenta):'—',col:'var(--fg)'},{l:'ROI',v:c.presupuesto>0?m.roi.toFixed(0)+'%':'—',col:m.roi>0?'var(--green)':m.roi<0?'var(--danger)':'var(--fg)'}].map(({l,v,col})=>(
                        <div key={l} style={{background:'var(--bg-subtle)',borderRadius:8,padding:'10px 14px'}}><div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:4}}>{l}</div><div style={{fontWeight:700,fontSize:14,color:col}}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!campanas.length && <div className="card" style={{padding:32,textAlign:'center'}}><p className="text-muted">Sin campañas registradas</p></div>}
            </div>
          )}
        </div>

        {detalle && !panelOpen && (() => {
          const c = detalle;
          const m = metricas(c);
          const leadsDetalle = leads.filter(l => l.campana_id === c.id);
          return (
            <div className="card" style={{position:'sticky',top:20}}>
              <div className="card-head"><h3 style={{fontSize:13}}>{c.nombre}</h3><button className="btn btn-sm btn-secondary" onClick={()=>setDetalle(null)}>✕</button></div>
              <div style={{padding:'0 24px 24px'}}>
                <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
                  <span className={'badge '+estadoBadge[c.estado]}>{ESTADOS_LABEL[c.estado]}</span>
                  <span className="badge badge-gray" style={{textTransform:'capitalize'}}>{c.tipo}</span>
                  <span className="badge badge-gray">{c.canal}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                  {[{l:'Leads generados',v:m.leadsGen,col:'var(--cyan)'},{l:'Convertidos',v:m.leadsConv,col:'var(--green)'},{l:'Ops ganadas',v:m.oppsGanadas,col:'var(--purple)'},{l:'Tasa conv.',v:m.tasaConv.toFixed(0)+'%',col:'var(--orange)'}].map(({l,v,col})=>(
                    <div key={l} style={{background:'var(--bg-subtle)',borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
                      <div style={{fontSize:20,fontWeight:800,color:col}}>{v}</div>
                      <div style={{fontSize:10,color:'var(--fg-muted)',marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
                  {[{l:'Ingreso atribuido',v:money(m.ingresoAtribuido),col:'var(--green)'},{l:'Presupuesto',v:money(c.presupuesto)},{l:'Costo por lead',v:m.leadsGen>0?money(m.cpl):'—'},{l:'ROI',v:c.presupuesto>0?m.roi.toFixed(0)+'%':'—',col:m.roi>0?'var(--green)':m.roi<0?'var(--danger)':undefined}].map(({l,v,col})=>(
                    <div key={l} className="row" style={{justifyContent:'space-between',padding:'8px 10px',background:'var(--bg-subtle)',borderRadius:6}}>
                      <span style={{fontSize:12,color:'var(--fg-muted)'}}>{l}</span><strong style={{fontSize:13,color:col||'var(--fg)'}}>{v}</strong>
                    </div>
                  ))}
                </div>
                {leadsDetalle.length > 0 && (
                  <>
                    <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:'var(--fg-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Leads</div>
                    <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:220,overflowY:'auto'}}>
                      {leadsDetalle.map(l=>(
                        <div key={l.id} style={{padding:'7px 10px',background:'var(--bg-subtle)',borderRadius:6,fontSize:12}}>
                          <div style={{fontWeight:600}}>{l.nombre}</div>
                          <div style={{color:'var(--fg-muted)',marginTop:1}}>{l.empresa_contacto} · <span className={'badge '+(l.convertido?'badge-green':'badge-gray')} style={{fontSize:9,padding:'1px 5px'}}>{l.convertido?'convertido':l.estado}</span></div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="row" style={{gap:8,marginTop:16}}>
                  <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={()=>abrirEditar(c)}>Editar</button>
                  {c.estado==='borrador'&&<button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>{cambiarEstadoCampana(c.id,'activa');setDetalle({...c,estado:'activa'});}}>Activar</button>}
                  {c.estado==='activa'&&<button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={()=>{cambiarEstadoCampana(c.id,'pausada');setDetalle({...c,estado:'pausada'});}}>Pausar</button>}
                  {c.estado==='pausada'&&<button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>{cambiarEstadoCampana(c.id,'activa');setDetalle({...c,estado:'activa'});}}>Reactivar</button>}
                  <button className="icon-btn" title="Eliminar campana" style={{color:'var(--danger)'}} onClick={()=>confirmarEliminar(c)}>{I.trash}</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {panelOpen && (
        <>
          <div className="side-panel-backdrop" onClick={cerrar}/>
          <div className="side-panel" style={{width:'min(560px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Formulario de registro</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700,marginTop:2}}>{editando ? 'Editar campaña' : 'Nueva campaña'}</div>
              </div>
              <button className="icon-btn" onClick={cerrar}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardar}>
              {formError && (
                <div style={{padding:'10px 12px', border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'var(--danger)', borderRadius:8, fontSize:12, marginBottom:14}}>
                  {formError}
                </div>
              )}
              <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:'var(--fg-muted)'}}>Datos de la campaña</div>
              <div className="grid-2" style={{gap:14,marginBottom:20}}>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Nombre *</label>
                  <input className="input" value={form.nombre} onChange={e=>upd('nombre',e.target.value)} placeholder="Ej: Google Ads Q3 2025" required autoFocus/>
                </div>
                <div className="input-group">
                  <label>Tipo</label>
                  <select className="select" value={form.tipo} onChange={e=>upd('tipo',e.target.value)}>{TIPOS.map(t=><option key={t} value={t}>{t}</option>)}</select>
                </div>
                <div className="input-group">
                  <label>Canal</label>
                  <select className="select" value={form.canal} onChange={e=>upd('canal',e.target.value)}>{CANALES.map(c=><option key={c}>{c}</option>)}</select>
                </div>
                <div className="input-group">
                  <label>Fecha inicio</label>
                  <input className="input" type="date" value={form.fecha_inicio} onChange={e=>upd('fecha_inicio',e.target.value)}/>
                </div>
                <div className="input-group">
                  <label>Fecha fin</label>
                  <input className="input" type="date" value={form.fecha_fin} onChange={e=>upd('fecha_fin',e.target.value)}/>
                </div>
                <div className="input-group">
                  <label>Presupuesto</label>
                  <input className="input" type="number" value={form.presupuesto} onChange={e=>upd('presupuesto',e.target.value)} placeholder="0"/>
                </div>
                <div className="input-group">
                  <label>Moneda</label>
                  <select className="select" value={form.moneda} onChange={e=>upd('moneda',e.target.value)}>
                    {monedasActivas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Estado</label>
                  <select className="select" value={form.estado} onChange={e=>upd('estado',e.target.value)}>{Object.entries(ESTADOS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Descripción</label>
                  <textarea className="input" rows={3} value={form.descripcion} onChange={e=>upd('descripcion',e.target.value)} placeholder="Objetivo y público de la campaña"/>
                </div>
              </div>
              <div className="row" style={{justifyContent:'flex-end',gap:10}}>
                <button type="button" className="btn btn-secondary" onClick={cerrar} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : (editando ? 'Guardar cambios' : 'Crear campaña')}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function BIComercial() {
  const [tab, setTab] = useState('pipeline');
  const [periodo, setPeriodo] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const { oportunidades, leads, cuentas, campanas, empresa, oppHistorialEtapas, cotizaciones } = useApp();

  const monedaBase = normalizeCurrencyCode(empresa?.moneda || empresa?.moneda_base || 'PEN');
  const getMoneda = item => normalizeCurrencyCode(item?.moneda || monedaBase);
  const getCreatedAt = item => item?.created_at || item?.fecha_creacion || null;
  const isInPeriodo = date => String(date || '').slice(0, 7) === periodo;
  const periodoDate = new Date(`${periodo}-01T00:00:00`);
  const periodoLabel = Number.isNaN(periodoDate.getTime())
    ? periodo
    : periodoDate.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

  const sortCurrencyLines = lines => {
    const order = Array.from(new Set([monedaBase, 'PEN', 'USD', 'EUR']));
    return [...lines].sort((a, b) => {
      const ai = order.indexOf(a.moneda);
      const bi = order.indexOf(b.moneda);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.moneda.localeCompare(b.moneda);
    });
  };
  const sumByCurrency = (rows, getAmount) => sortCurrencyLines(Object.entries(rows.reduce((acc, row) => {
    const moneda = getMoneda(row);
    acc[moneda] = (acc[moneda] || 0) + Number(getAmount(row) || 0);
    return acc;
  }, {})).map(([moneda, valor]) => ({ moneda, valor })));
  const etapaLabel = etapa => ({
    calificacion: 'Calificacion',
    propuesta: 'Propuesta',
    negociacion: 'Negociacion',
    cierre: 'Cierre',
    ganada: 'Ganada',
    perdida: 'Perdida',
  }[String(etapa || '').toLowerCase()] || String(etapa || 'Sin etapa'));
  const avgByCurrency = (rows, getAmount) => sortCurrencyLines(Object.entries(rows.reduce((acc, row) => {
    const moneda = getMoneda(row);
    if (!acc[moneda]) acc[moneda] = { total: 0, count: 0 };
    acc[moneda].total += Number(getAmount(row) || 0);
    acc[moneda].count += 1;
    return acc;
  }, {})).map(([moneda, data]) => ({ moneda, valor: data.count ? Math.round(data.total / data.count) : 0 })));
  const sumOppsByCurrency = rows => sortCurrencyLines(Object.entries(rows.reduce((acc, opp) => {
    const real = getOppMontoReal(opp, cotizaciones);
    acc[real.moneda] = (acc[real.moneda] || 0) + real.monto;
    return acc;
  }, {})).map(([moneda, valor]) => ({ moneda, valor })));
  const avgOppsByCurrency = rows => sortCurrencyLines(Object.entries(rows.reduce((acc, opp) => {
    const real = getOppMontoReal(opp, cotizaciones);
    if (!acc[real.moneda]) acc[real.moneda] = { total: 0, count: 0 };
    acc[real.moneda].total += real.monto;
    acc[real.moneda].count += 1;
    return acc;
  }, {})).map(([moneda, data]) => ({ moneda, valor: data.count ? Math.round(data.total / data.count) : 0 })));
  const forecastOppsByCurrency = rows => sortCurrencyLines(Object.entries(rows.reduce((acc, opp) => {
    const forecast = getOppForecastReal(opp, cotizaciones);
    acc[forecast.moneda] = (acc[forecast.moneda] || 0) + forecast.monto;
    return acc;
  }, {})).map(([moneda, valor]) => ({ moneda, valor })));
  const formatMoneyLinesInline = (lines, empty = '—') => lines.length
    ? lines.map(row => moneyCurrency(row.valor, row.moneda)).join(' · ')
    : empty;
  const renderFunnelMoneyLines = (lines) => {
    const rows = lines.length ? lines : [{ moneda: monedaBase, valor: 0 }];
    return (
      <div className="bi-funnel-money">
        {rows.map(row => <span key={row.moneda}>{moneyCurrency(row.valor, row.moneda)}</span>)}
      </div>
    );
  };
  const renderMoneyLines = (lines, { kpi = false, empty = null } = {}) => {
    if (!lines.length && empty != null) {
      return (
        <div className={kpi ? 'kpi-value' : undefined} style={{ fontSize: kpi ? 20 : 12, lineHeight: 1.2, color: kpi ? undefined : 'var(--fg-muted)' }}>
          {empty}
        </div>
      );
    }
    const rows = lines.length ? lines : [{ moneda: monedaBase, valor: 0 }];
    return (
      <div
        className={kpi ? 'kpi-value' : undefined}
        style={{
          fontSize: kpi ? 20 : 12,
          lineHeight: rows.length > 1 ? 1.28 : 1.2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: kpi ? 'flex-start' : 'flex-end',
          gap: rows.length > 1 ? 2 : 0,
          color: kpi ? undefined : 'var(--fg-muted)',
        }}
      >
        {rows.map(row => <span key={row.moneda}>{moneyCurrency(row.valor, row.moneda)}</span>)}
      </div>
    );
  };

  const leadsPeriodo = leads.filter(l => isInPeriodo(getCreatedAt(l)));
  const oportunidadesPeriodo = oportunidades.filter(o => isInPeriodo(getCreatedAt(o)));
  const oppStageDate = (opp, etapa) => {
    const event = (oppHistorialEtapas || [])
      .filter(h => (h.opp_id || h.oportunidad_id) === opp.id && h.etapa_hasta === etapa)
      .sort((a, b) => String(b.creado_en || b.fecha || '').localeCompare(String(a.creado_en || a.fecha || '')))[0];
    return event?.creado_en || event?.fecha || opp.fecha_cierre_real || null;
  };

  const oppsAbiertas  = oportunidadesPeriodo.filter(o => o.estado === 'abierta');
  const oppsGanadas   = oportunidades.filter(o => o.estado === 'ganada' && isInPeriodo(oppStageDate(o, 'ganada')));
  const oppsPerdidas  = oportunidades.filter(o => o.estado === 'perdida' && isInPeriodo(oppStageDate(o, 'perdida') || getCreatedAt(o)));
  const forecastLines = forecastOppsByCurrency(oppsAbiertas);
  const ticketLines   = avgOppsByCurrency(oppsGanadas);
  const pipelinePromLines = avgOppsByCurrency(oppsAbiertas);
  const totalCierres  = oppsGanadas.length + oppsPerdidas.length;
  const tasaCierre    = totalCierres > 0 ? Math.min(100, Math.round(oppsGanadas.length / totalCierres * 100)) : 0;
  const leadsActivosRows = leadsPeriodo.filter(l => !l.convertido && l.estado !== 'convertido');
  const leadsActivos  = leadsActivosRows.length;
  const leadEstadoKey = lead => String(lead.estado || 'sin_estado').toLowerCase().trim().replace(/\s+/g, '_');
  const leadsActivosBreakdown = [
    { key: 'nuevo', label: 'en nuevo', count: leadsActivosRows.filter(l => leadEstadoKey(l) === 'nuevo').length },
    { key: 'contacto', label: 'en contacto', count: leadsActivosRows.filter(l => ['contacto', 'en_contacto'].includes(leadEstadoKey(l))).length },
    { key: 'calificado', label: 'calificados', count: leadsActivosRows.filter(l => leadEstadoKey(l) === 'calificado').length },
  ];
  const forecastTooltipRows = oppsAbiertas.map(opp => {
    const real = getOppMontoReal(opp, cotizaciones);
    const forecast = getOppForecastReal(opp, cotizaciones);
    return {
      id: opp.id,
      nombre: opp.nombre,
      etapa: etapaLabel(opp.etapa),
      monto: real.monto,
      forecast: forecast.monto,
      moneda: forecast.moneda,
      probabilidad: getOppProbabilidadReal(opp),
    };
  });
  const ticketTooltipRows = oppsGanadas.map(opp => {
    const real = getOppMontoReal(opp, cotizaciones);
    return {
      id: opp.id,
      nombre: opp.nombre,
      monto: real.monto,
      moneda: real.moneda,
    };
  });

  const etapaRank = { prospeccion: 0, calificacion: 1, propuesta: 2, negociacion: 3, cierre: 3, ganada: 4 };
  const getEtapaComparable = opp => opp.estado === 'ganada' ? 'ganada' : (opp.etapa || '');
  const isStageAtLeast = (opp, etapa) => (etapaRank[getEtapaComparable(opp)] ?? -1) >= etapaRank[etapa];
  const _fLeadsCalifNoConv = leadsPeriodo.filter(l => l.estado === 'calificado' && !l.convertido);
  const _fLeadsConvertidos = leadsPeriodo.filter(l => l.convertido || l.estado === 'convertido');
  const _fLeadsCalif    = [..._fLeadsCalifNoConv, ..._fLeadsConvertidos];
  const _fGanada        = oportunidadesPeriodo.filter(o => o.etapa === 'ganada' || o.estado === 'ganada');
  const _fPerdida       = oportunidadesPeriodo.filter(o => o.etapa === 'perdida');
  const _oppsCalifOMas  = oportunidadesPeriodo.filter(o => isStageAtLeast(o, 'calificacion'));
  const _oppsPropOMas   = oportunidadesPeriodo.filter(o => isStageAtLeast(o, 'propuesta'));
  const _oppsNegOMas    = oportunidadesPeriodo.filter(o => isStageAtLeast(o, 'negociacion'));
  const _pct  = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 100)) : null;

  const funnelSteps = [
    { key: 'leads_totales', label: 'Leads totales',      color: 'var(--cyan)',    count: leadsPeriodo.length,     values: sumByCurrency(leadsPeriodo, l => l.presupuesto_estimado || 0), pct: null, note: 'del periodo' },
    { key: 'leads_calif',   label: 'Leads calificados',  color: '#22d3ee',        count: _fLeadsCalif.length,     values: sumByCurrency(_fLeadsCalif, l => l.presupuesto_estimado || 0), pct: _pct(_fLeadsCalif.length, leadsPeriodo.length), note: 'calificados o convertidos' },
    { key: 'calificacion',  label: 'Calificación',       color: '#64748b',        count: _oppsCalifOMas.length,   values: sumOppsByCurrency(_oppsCalifOMas), pct: _pct(_oppsCalifOMas.length, _fLeadsCalif.length), note: 'opp / leads calificados' },
    { key: 'propuesta',     label: 'Propuesta',           color: 'var(--purple)',  count: _oppsPropOMas.length,    values: sumOppsByCurrency(_oppsPropOMas), pct: _pct(_oppsPropOMas.length, _oppsCalifOMas.length), note: 'llegaron a esta etapa o mas' },
    { key: 'negociacion',   label: 'Negociación',         color: 'var(--orange)',  count: _oppsNegOMas.length,     values: sumOppsByCurrency(_oppsNegOMas), pct: _pct(_oppsNegOMas.length, _oppsPropOMas.length), note: 'llegaron a esta etapa o mas' },
    { key: 'ganada',        label: 'Ganada',              color: 'var(--green)',   count: _fGanada.length,         values: sumOppsByCurrency(_fGanada), pct: _pct(_fGanada.length, _oppsNegOMas.length), note: 'ganadas' },
  ];
  const maxFunnelCount = Math.max(...funnelSteps.map(f => f.count), 1);
  const _baseParaPerdida = _oppsNegOMas.length + _fPerdida.length;
  const pctPerdida = _pct(_fPerdida.length, _baseParaPerdida);

  const fuentesMap = {};
  leadsPeriodo.forEach(l => { fuentesMap[l.fuente] = (fuentesMap[l.fuente] || 0) + 1; });
  const fuentesArr = Object.entries(fuentesMap).sort((a, b) => b[1] - a[1]);
  const urgMap     = { alta: leadsPeriodo.filter(l=>l.urgencia==='alta').length, media: leadsPeriodo.filter(l=>l.urgencia==='media').length, baja: leadsPeriodo.filter(l=>l.urgencia==='baja').length };
  const percentLabel = (value, total) => total > 0 ? `${Math.round(value / total * 100)}%` : '—';
  const periodoBase = Number.isNaN(periodoDate.getTime()) ? new Date() : periodoDate;
  const leadsTrend = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(periodoBase.getFullYear(), periodoBase.getMonth() - (5 - index), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      key,
      mes: d.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase()),
      leads: leads.filter(l => String(getCreatedAt(l) || '').slice(0, 7) === key).length,
    };
  });

  const respMap = {};
  oppsAbiertas.forEach(o => {
    if (!respMap[o.responsable]) respMap[o.responsable] = { count: 0, forecast: {} };
    respMap[o.responsable].count++;
    const forecast = getOppForecastReal(o, cotizaciones);
    respMap[o.responsable].forecast[forecast.moneda] = (respMap[o.responsable].forecast[forecast.moneda] || 0) + forecast.monto;
  });
  const respForecastLines = data => sortCurrencyLines(Object.entries(data.forecast).map(([moneda, valor]) => ({ moneda, valor })));
  const respForecastValue = data => respForecastLines(data).reduce((sum, row) => sum + Number(row.valor || 0), 0);

  const tendencia = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(periodoBase.getFullYear(), periodoBase.getMonth() - (5 - index), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ops = oportunidades.filter(o => {
      if (o.estado !== 'ganada') return false;
      const fechasGanada = [oppStageDate(o, 'ganada'), o.fecha_cierre_real].filter(Boolean);
      return fechasGanada.some(fecha => String(fecha).slice(0, 7) === key);
    });
    const values = sumOppsByCurrency(ops);
    return {
      key,
      mes: d.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase()),
      ventas: ops.length,
      values,
      valor: values.reduce((sum, row) => sum + Number(row.valor || 0), 0),
    };
  });

  const etapaBadge = { calificacion:'badge-cyan', propuesta:'badge-purple', negociacion:'badge-orange' };
  const getNombre  = id => { const c = cuentas.find(c => c.id === id); return c?.razon_social || c?.nombre_comercial || id; };
  const KpiTooltip = ({ title, description, items, footerLabel, footerValue }) => (
    <div className="bi-kpi-tooltip" role="tooltip">
      <div className="bi-tooltip-title">{title}</div>
      <div className="bi-tooltip-description">{description}</div>
      <div className="bi-tooltip-separator" />
      <div className="bi-tooltip-items">
        {items.length ? items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="bi-tooltip-row">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        )) : (
          <div className="bi-tooltip-row is-empty">
            <span>Sin datos en el periodo</span>
            <strong>-</strong>
          </div>
        )}
      </div>
      <div className="bi-tooltip-separator" />
      <div className="bi-tooltip-row bi-tooltip-result">
        <span>{footerLabel}</span>
        <strong>{footerValue}</strong>
      </div>
    </div>
  );
  const BiBarChart = ({ data }) => {
    const rows = Array.isArray(data) ? data : [];
    const maxValue = Math.max(...rows.map(row => Number(row.value || 0)), 1);
    return (
      <div style={{padding:'20px 24px'}}>
        <div style={{display:'flex', gap:18, justifyContent:'center', alignItems:'stretch', height:200}}>
          {rows.map(row => {
            const value = Number(row.value || 0);
            const height = value > 0 ? `${value / maxValue * 100}%` : 4;
            return (
              <div key={row.key || row.label} style={{width:60, flex:'0 0 60px', display:'flex', flexDirection:'column', alignItems:'center'}}>
                <div style={{fontSize:12, fontWeight:500, color:'var(--color-text-primary, var(--fg))', textAlign:'center', minHeight:16, marginBottom:4, whiteSpace:'nowrap'}}>
                  {value > 0 ? row.valueLabel : '—'}
                </div>
                <div style={{flex:1, width:60, display:'flex', alignItems:'flex-end'}}>
                  <div
                    style={{
                      width:'100%',
                      height,
                      background: row.color || 'var(--cyan)',
                      borderRadius:'4px 4px 0 0',
                      opacity: row.opacity ?? 1,
                    }}
                  />
                </div>
                <div style={{fontSize:11, color:'var(--fg-subtle)', textAlign:'center', marginTop:6}}>{row.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const BiMetricRows = ({ rows, empty = 'Sin datos en el período' }) => {
    const items = Array.isArray(rows) ? rows : [];
    const maxValue = Math.max(...items.map(row => Number(row.barValue ?? row.number ?? 0)), 1);
    if (!items.length) return <div className="bi-metric-empty">{empty}</div>;
    return (
      <div className="bi-metric-list">
        {items.map((row, index) => {
          const color = row.color || 'var(--cyan)';
          const barValue = Number(row.barValue ?? row.number ?? 0);
          return (
            <div key={row.key || row.label || index} className="bi-metric-row" style={{'--accent': color}}>
              <div className="bi-metric-label">{row.label}</div>
              <div className="bi-metric-bar">
                <div style={{width:`${Math.round(barValue / maxValue * 100)}%`, background:color}} />
              </div>
              <div className="bi-metric-number-block">
                <div className="bi-metric-number">{row.number}</div>
                <div className="bi-metric-note">{row.note}</div>
              </div>
              <div className="bi-metric-value">{row.value}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">BI Comercial</h1><div className="page-sub">Pipeline, leads y rendimiento comercial · {periodoLabel}</div></div>
        <div className="row" style={{gap:10}}>
          <input className="input" type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{width:150}}/>
          <button className="btn btn-secondary">{I.download} Exportar</button>
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card bi-kpi-card" tabIndex={0}>
          <div className="kpi-label">Forecast pipeline</div>
          {renderMoneyLines(forecastLines, { kpi: true })}
          <div className="text-muted" style={{fontSize:11, marginTop:6}}>Pipeline promedio: {formatMoneyLinesInline(pipelinePromLines)}</div>
          <div className="kpi-icon cyan">{I.trend}</div>
          <KpiTooltip
            title="FORECAST PIPELINE"
            description="suma del monto ponderado por probabilidad de cada oportunidad abierta"
            items={forecastTooltipRows.map(row => ({
              label: `${row.nombre} · ${row.etapa}`,
              value: moneyCurrency(row.forecast, row.moneda),
            }))}
            footerLabel="Total"
            footerValue={formatMoneyLinesInline(forecastLines)}
          />
        </div>
        <div className="kpi-card bi-kpi-card" tabIndex={0}>
          <div className="kpi-label">Tasa de cierre</div>
          <div className="kpi-value" style={{color:tasaCierre>=50?'var(--green)':'var(--orange)'}}>{tasaCierre}%</div>
          <div className={'kpi-icon '+(tasaCierre>=50?'green':'orange')}>{I.target}</div>
          <KpiTooltip
            title="TASA DE CIERRE"
            description="porcentaje de oportunidades ganadas sobre oportunidades cerradas"
            items={[
              { label: 'Ganadas', value: oppsGanadas.length },
              { label: 'Perdidas', value: oppsPerdidas.length },
            ]}
            footerLabel="Tasa"
            footerValue={`${tasaCierre}%`}
          />
        </div>
        <div className="kpi-card bi-kpi-card" tabIndex={0}>
          <div className="kpi-label">Ticket promedio</div>
          {renderMoneyLines(ticketLines, { kpi: true, empty: '—' })}
          <div className="kpi-icon purple">{I.dollar}</div>
          <KpiTooltip
            title="TICKET PROMEDIO"
            description="monto promedio de oportunidades ganadas en el periodo"
            items={ticketTooltipRows.map(row => ({
              label: row.nombre,
              value: moneyCurrency(row.monto, row.moneda),
            }))}
            footerLabel="Promedio"
            footerValue={formatMoneyLinesInline(ticketLines, '—')}
          />
        </div>
        <div className="kpi-card bi-kpi-card" tabIndex={0}>
          <div className="kpi-label">Leads activos</div>
          <div className="kpi-value">{leadsActivos}</div>
          <div className="kpi-icon orange">{I.users}</div>
          <KpiTooltip
            title="LEADS ACTIVOS"
            description="leads que aun no han sido convertidos en oportunidad"
            items={leadsActivosBreakdown.map(row => ({
              label: row.label.replace(/^en /, 'En ').replace(/^calificados$/, 'Calificados'),
              value: row.count,
            }))}
            footerLabel="Total activos"
            footerValue={leadsActivos}
          />
        </div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='pipeline'?'active':'')} onClick={()=>setTab('pipeline')}>Pipeline</div>
        <div className={'tab '+(tab==='leads'?'active':'')} onClick={()=>setTab('leads')}>Leads y Fuentes</div>
        <div className={'tab '+(tab==='rendimiento'?'active':'')} onClick={()=>setTab('rendimiento')}>Rendimiento Comercial</div>
        <div className={'tab '+(tab==='campanas'?'active':'')} onClick={()=>setTab('campanas')}>Por campaña</div>
      </div>

      {tab === 'campanas' && (() => {
        const metCamp = (camp) => {
          const lg = leadsPeriodo.filter(l => l.campana_id === camp.id);
          const lc = lg.filter(l => l.convertido);
          const og = oportunidadesPeriodo.filter(o => o.campana_id === camp.id && o.estado === 'ganada');
          const ing = og.reduce((s, o) => s + getOppMontoReal(o, cotizaciones).monto, 0);
          const p = camp.presupuesto || 0;
          return { leadsGen: lg.length, leadsConv: lc.length, oppsGanadas: og.length, ingresoAtribuido: ing, moneda: og[0] ? getOppMontoReal(og[0], cotizaciones).moneda : getMoneda(camp), cpl: lg.length > 0 ? p / lg.length : 0, roi: p > 0 ? (ing - p) / p * 100 : 0, tasaConv: lg.length > 0 ? Math.min(100, lc.length / lg.length * 100) : 0 };
        };
        const maxLeads = Math.max(...(campanas||[]).map(c => metCamp(c).leadsGen), 1);
        return (
          <div style={{display:'grid',gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Leads por campaña</h3><span className="text-muted" style={{fontSize:12}}>{leadsPeriodo.filter(l=>l.campana_id).length} leads atribuidos</span></div>
              <div style={{padding:'16px 24px',display:'flex',flexDirection:'column',gap:16}}>
                {(campanas||[]).map(c => {
                  const m = metCamp(c);
                  return (
                    <div key={c.id}>
                      <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
                        <span style={{fontSize:13,fontWeight:500}}>{c.nombre}</span>
                        <span style={{fontSize:12,color:'var(--fg-muted)'}}>{m.leadsGen} leads · <strong style={{color:'var(--fg)'}}>{m.tasaConv.toFixed(0)}% conv.</strong></span>
                      </div>
                      <div style={{height:8,background:'var(--bg-subtle)',borderRadius:4}}>
                        <div style={{width:Math.round(m.leadsGen/maxLeads*100)+'%',height:'100%',background:'var(--cyan)',borderRadius:4}}/>
                      </div>
                    </div>
                  );
                })}
                {!(campanas||[]).length && <p className="text-muted">Sin campañas registradas</p>}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Métricas de atribución</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Campaña</th><th>Canal</th><th>Leads</th><th>Conv.</th><th>Ops ganadas</th><th className="num">Ingreso atribuido</th><th className="num">Costo/lead</th><th className="num">ROI</th></tr></thead>
                  <tbody>
                    {(campanas||[]).map(c => {
                      const m = metCamp(c);
                      return (
                        <tr key={c.id} className="hover-row">
                          <td style={{fontWeight:600}}>{c.nombre}</td>
                          <td><span className="badge badge-gray" style={{fontSize:11}}>{c.canal}</span></td>
                          <td style={{fontWeight:700}}>{m.leadsGen}</td>
                          <td><span style={{fontWeight:600,color:m.tasaConv>20?'var(--green)':'var(--fg)'}}>{m.tasaConv.toFixed(0)}%</span></td>
                          <td>{m.oppsGanadas}</td>
                          <td className="num" style={{color:'var(--green)',fontWeight:600}}>{moneyCurrency(m.ingresoAtribuido, m.moneda)}</td>
                          <td className="num">{m.leadsGen>0?moneyCurrency(m.cpl, getMoneda(c)):'—'}</td>
                          <td className="num"><span style={{fontWeight:700,color:m.roi>0?'var(--green)':m.roi<0?'var(--danger)':'var(--fg-muted)'}}>{c.presupuesto>0?m.roi.toFixed(0)+'%':'—'}</span></td>
                        </tr>
                      );
                    })}
                    {!(campanas||[]).length && <tr><td colSpan={8} className="text-muted" style={{textAlign:'center',padding:24}}>Sin campañas</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {tab === 'pipeline' && (
        <div style={{display:'grid', gap:20}}>
          <div className="card">
            <div className="card-head"><h3>Embudo Comercial Unificado</h3><span className="text-muted" style={{fontSize:12}}>{leadsPeriodo.length} leads · {oportunidadesPeriodo.length} oportunidades</span></div>
            <div className="bi-funnel">
              {funnelSteps.map((f, i) => {
                const pct = f.pct;
                return (
                  <div key={f.key} className="bi-funnel-row">
                    <div className="bi-funnel-stage" style={{color:f.color}}>{f.label}</div>
                    <div className="bi-funnel-bar">
                      <div style={{width:Math.round(f.count/maxFunnelCount*100)+'%', background:f.color}}/>
                    </div>
                    <div className="bi-funnel-count-block">
                      <div className="bi-funnel-count" style={{color:f.color}}>{f.count}</div>
                      {f.note && <div className="bi-funnel-note">{f.note}</div>}
                    </div>
                    <div className="bi-funnel-result">
                      <div className="bi-funnel-values">
                      {renderFunnelMoneyLines(f.values)}
                    </div>
                      <div className={pct != null ? 'bi-funnel-pct' : 'bi-funnel-pct muted'}>
                      {pct != null ? pct + '%' : '—'}
                      </div>
                    </div>
                    {f.key === 'ganada' && _baseParaPerdida > 0 && (
                      <div className="bi-funnel-loss">
                        <span style={{fontSize:12, color:'var(--danger)', fontWeight:500}}>Perdidas: {_fPerdida.length}</span>
                        {pctPerdida != null && <span style={{fontSize:11, color:'var(--fg-muted)'}}>({pctPerdida}% tasa de pérdida)</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Oportunidades abiertas</h3><span className="badge badge-cyan">{oppsAbiertas.length}</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Oportunidad</th><th>Etapa</th><th>Responsable</th><th>Fuente</th><th className="num">Monto est.</th><th className="num">Forecast</th><th>Cierre est.</th></tr></thead>
                <tbody>
                  {oppsAbiertas.sort((a,b)=>getOppForecastReal(b, cotizaciones).monto-getOppForecastReal(a, cotizaciones).monto).map(o => {
                    const real = getOppMontoReal(o, cotizaciones);
                    const forecast = getOppForecastReal(o, cotizaciones);
                    return (
                      <tr key={o.id} className="hover-row">
                        <td><div style={{fontWeight:600,fontSize:13}}>{o.nombre}</div><div className="text-muted" style={{fontSize:11}}>{getNombre(o.cuenta_id)}</div></td>
                        <td><span className={'badge '+(etapaBadge[o.etapa]||'badge-gray')} style={{textTransform:'capitalize'}}>{o.etapa}</span></td>
                        <td>{o.responsable}</td>
                        <td><span className="badge badge-gray" style={{fontSize:11}}>{o.fuente}</span></td>
                        <td className="num">{moneyCurrency(real.monto, real.moneda)}</td>
                        <td className="num"><strong style={{color:'var(--green)'}}>{moneyCurrency(forecast.monto, forecast.moneda)}</strong></td>
                        <td className="text-muted" style={{fontSize:12}}>{o.fecha_cierre_estimada}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div style={{display:'grid', gap:20}}>
          <div className="card">
            <div className="card-head"><h3>Distribución de Leads</h3><span className="badge badge-cyan">{leadsPeriodo.length}</span></div>
            <div style={{padding:'16px 24px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:28}}>
              <div style={{display:'flex', flexDirection:'column', gap:14}}>
                <div className="eyebrow">Leads por Fuente</div>
                <BiMetricRows
                  rows={fuentesArr.map(([fuente, cnt]) => ({
                    key: fuente || 'sin_fuente',
                    label: fuente || 'Sin fuente',
                    color: 'var(--cyan)',
                    barValue: cnt,
                    number: cnt,
                    note: 'del período',
                    value: percentLabel(cnt, leadsPeriodo.length),
                  }))}
                  empty="Sin leads en el período"
                />
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:14}}>
                <div className="eyebrow">Leads por Urgencia</div>
                <BiMetricRows
                  rows={[
                    { key:'alta', label:'Alta urgencia', color:'var(--danger)', count:urgMap.alta },
                    { key:'media', label:'Media urgencia', color:'var(--orange)', count:urgMap.media },
                    { key:'baja', label:'Baja urgencia', color:'var(--green)', count:urgMap.baja },
                  ].map(u => ({
                    key: u.key,
                    label: u.label,
                    color: u.color,
                    barValue: u.count,
                    number: u.count,
                    note: 'de los leads',
                    value: percentLabel(u.count, leadsPeriodo.length),
                  }))}
                />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Evolución de Leads — últimos 6 meses</h3><span className="badge badge-cyan">{leadsPeriodo.length}</span></div>
            <BiBarChart
              data={leadsTrend.map(t => ({
                key: t.key,
                label: t.mes,
                value: t.leads,
                valueLabel: String(t.leads),
                color: t.key === periodo ? 'var(--cyan)' : 'var(--navy)',
                opacity: t.key === periodo ? 1 : 0.65,
              }))}
            />
          </div>
          <div className="card">
            <div className="card-head"><h3>Leads — Detalle</h3><span className="badge badge-cyan">{leadsPeriodo.length}</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Nombre</th><th>Empresa</th><th>Fuente</th><th>Urgencia</th><th className="num">Presupuesto est.</th><th>Responsable</th><th>Estado</th></tr></thead>
                <tbody>
                  {leadsPeriodo.map(l => (
                    <tr key={l.id} className="hover-row">
                      <td style={{fontWeight:600}}>{l.nombre}</td>
                      <td>{l.empresa_contacto}</td>
                      <td><span className="badge badge-gray" style={{fontSize:11}}>{l.fuente}</span></td>
                      <td><span className={'badge '+(l.urgencia==='alta'?'badge-red':l.urgencia==='media'?'badge-orange':'badge-green')} style={{fontSize:11}}>{l.urgencia}</span></td>
                      <td className="num">{moneyCurrency(l.presupuesto_estimado, getMoneda(l))}</td>
                      <td>{l.responsable}</td>
                      <td><span className={'badge '+(l.estado==='calificado'?'badge-cyan':l.estado==='nuevo'?'badge-gray':l.estado==='en_contacto'?'badge-purple':'badge-orange')} style={{textTransform:'capitalize'}}>{l.estado.replace('_',' ')}</span></td>
                    </tr>
                  ))}
                  {!leadsPeriodo.length && <tr><td colSpan={7} className="text-muted" style={{textAlign:'center', padding:24}}>Sin leads en el período</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'rendimiento' && (
        <div style={{display:'grid', gap:20}}>
          <div className="card">
            <div className="card-head"><h3>Forecast por Responsable</h3></div>
            <div style={{padding:'16px 24px'}}>
              <BiMetricRows
                rows={Object.entries(respMap)
                  .sort((a,b)=>respForecastValue(b[1])-respForecastValue(a[1]))
                  .map(([resp, data]) => ({
                    key: resp,
                    label: resp,
                    color: 'var(--cyan)',
                    barValue: respForecastValue(data),
                    number: data.count,
                    note: 'oportunidades',
                    value: formatMoneyLinesInline(respForecastLines(data), '—'),
                  }))}
                empty="Sin oportunidades abiertas"
              />
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Ventas cerradas — últimos 6 meses</h3><span className="badge badge-cyan">{oppsGanadas.length}</span></div>
            <BiBarChart
              data={tendencia.map(t => ({
                key: t.key,
                label: t.mes,
                value: t.valor,
                valueLabel: formatMoneyLinesInline(t.values, '—'),
                color: t.key === periodo ? 'var(--cyan)' : 'var(--navy)',
                opacity: t.key === periodo ? 1 : 0.65,
              }))}
            />
          </div>
        </div>
      )}
    </>
  );
}

function BIOperativo() {
  const [tab, setTab] = useState('ots');
  const { ots, partes, backlog, cuentas } = useApp();

  const otsMes = [
    ...ots,
    { id:'ot_e1', numero:'OT-25-0011', cliente:'Planta Industrial Norte', tipo:'Preventiva', estado:'cerrada', avance:100, sla:'ok',     responsable:'Luis Mendoza',  costoEst:6000,  costoReal:5800  },
    { id:'ot_e2', numero:'OT-25-0010', cliente:'Logística Altiplano',      tipo:'Correctiva',estado:'cerrada', avance:100, sla:'riesgo',  responsable:'Carlos Reyes',  costoEst:12000, costoReal:13500 },
    { id:'ot_e3', numero:'OT-25-0009', cliente:'Minera Andes SAC',         tipo:'Preventiva', estado:'cerrada', avance:100, sla:'ok',     responsable:'Rosa Huanca',   costoEst:9000,  costoReal:8700  },
    { id:'ot_e4', numero:'OT-25-0008', cliente:'Facilities Lima',          tipo:'Proyectiva', estado:'ejecucion',avance:65, sla:'ok',    responsable:'Pedro Condori', costoEst:18000, costoReal:11200 },
  ];

  const otsCerradas = otsMes.filter(o => o.estado === 'cerrada').length;
  const slaPct      = Math.round(otsMes.filter(o => o.sla === 'ok').length / otsMes.length * 100);
  const horasMes    = partes.reduce((s, p) => s + p.horas, 0);
  const avanceProm  = Math.round(otsMes.reduce((s, o) => s + (o.avance || 0), 0) / otsMes.length);

  const tipoMap = {};
  otsMes.forEach(o => { tipoMap[o.tipo] = (tipoMap[o.tipo] || 0) + 1; });
  const maxTipo = Math.max(...Object.values(tipoMap), 1);

  const respMap = {};
  otsMes.forEach(o => {
    if (!respMap[o.responsable]) respMap[o.responsable] = { total: 0, cerradas: 0, horas: 0 };
    respMap[o.responsable].total++;
    if (o.estado === 'cerrada') respMap[o.responsable].cerradas++;
  });
  partes.forEach(p => {
    if (respMap[p.tecnico]) respMap[p.tecnico].horas += p.horas;
    else respMap[p.tecnico] = { total: 0, cerradas: 0, horas: p.horas };
  });
  const maxRespTotal = Math.max(...Object.values(respMap).map(r => r.total), 1);

  const tendencia = [
    { mes:'Nov', ots:12, cerradas:10 },
    { mes:'Dic', ots:8,  cerradas:7  },
    { mes:'Ene', ots:15, cerradas:13 },
    { mes:'Feb', ots:11, cerradas:9  },
    { mes:'Mar', ots:14, cerradas:12 },
    { mes:'Abr', ots:otsMes.length, cerradas:otsCerradas },
  ];
  const maxOts = Math.max(...tendencia.map(t => t.ots), 1);

  const bkPend     = backlog.filter(b => b.estado === 'pendiente');
  const bkPriority = { alta: bkPend.filter(b=>b.prioridad==='alta').length, media: bkPend.filter(b=>b.prioridad==='media').length, baja: bkPend.filter(b=>b.prioridad==='baja').length };

  const otsCerDat  = otsMes.filter(o => o.estado === 'cerrada' && (o.costoEst || 0) > 0);
  const eficiencia = otsCerDat.length > 0 ? Math.round(otsCerDat.reduce((s, o) => s + (o.costoReal || 0) / (o.costoEst || 1) * 100, 0) / otsCerDat.length) : 100;

  const tipoColors = ['var(--cyan)','var(--purple)','var(--orange)','var(--green)'];

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">BI Operativo</h1><div className="page-sub">Rendimiento de OTs, técnicos y SLAs · Abril 2026</div></div>
        <button className="btn btn-secondary">{I.download} Exportar</button>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">OTs del mes</div><div className="kpi-value">{otsMes.length}</div><div className="kpi-icon cyan">{I.wrench}</div></div>
        <div className="kpi-card"><div className="kpi-label">Completadas</div><div className="kpi-value" style={{color:'var(--green)'}}>{otsCerradas}</div><div className="kpi-icon green">{I.check}</div></div>
        <div className="kpi-card"><div className="kpi-label">Avance promedio</div><div className="kpi-value">{avanceProm}%</div><div className="kpi-icon purple">{I.trend}</div></div>
        <div className="kpi-card"><div className="kpi-label">SLA cumplido</div><div className="kpi-value" style={{color:slaPct>=80?'var(--green)':'var(--orange)'}}>{slaPct}%</div><div className={'kpi-icon '+(slaPct>=80?'green':'orange')}>{I.shield}</div></div>
        <div className="kpi-card"><div className="kpi-label">Horas campo</div><div className="kpi-value">{horasMes}h</div><div className="kpi-icon orange">{I.clock}</div></div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='ots'?'active':'')} onClick={()=>setTab('ots')}>OTs y Ejecución</div>
        <div className={'tab '+(tab==='recursos'?'active':'')} onClick={()=>setTab('recursos')}>Recursos</div>
        <div className={'tab '+(tab==='backlog'?'active':'')} onClick={()=>setTab('backlog')}>Backlog y Alertas</div>
      </div>

      {tab === 'ots' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Tendencia OTs — últimos 6 meses</h3></div>
              <div style={{padding:'20px 24px'}}>
                <div style={{display:'flex', gap:6, alignItems:'flex-end', height:160}}>
                  {tendencia.map((t, i) => (
                    <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                      <div style={{flex:1, width:'100%', display:'flex', gap:3, alignItems:'flex-end'}}>
                        <div style={{flex:1, height:Math.round(t.ots/maxOts*140)+'px', background:i===5?'var(--cyan)':'var(--navy)', borderRadius:'2px 2px 0 0', opacity:i===5?1:0.6}}/>
                        <div style={{flex:1, height:Math.round(t.cerradas/maxOts*140)+'px', background:'var(--green)', borderRadius:'2px 2px 0 0', opacity:0.75}}/>
                      </div>
                      <div style={{fontSize:11, color:'var(--fg-subtle)'}}>{t.mes}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex', gap:16, marginTop:12, fontSize:12}}>
                  <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:10,height:10,borderRadius:2,background:'var(--navy)',display:'inline-block'}}/> Total</span>
                  <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:10,height:10,borderRadius:2,background:'var(--green)',display:'inline-block'}}/> Completadas</span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>OTs por Tipo</h3></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:14}}>
                {Object.entries(tipoMap).sort((a,b)=>b[1]-a[1]).map(([tipo, cnt], i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'120px 1fr 40px', gap:10, alignItems:'center'}}>
                    <span style={{fontSize:13}}>{tipo}</span>
                    <div style={{height:10, background:'var(--bg-subtle)', borderRadius:4}}>
                      <div style={{width:Math.round(cnt/maxTipo*100)+'%', height:'100%', background:tipoColors[i%tipoColors.length], borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:13, fontWeight:700, textAlign:'right'}}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>OTs — Estado actual</h3><span className="text-muted" style={{fontSize:12}}>{otsMes.length} OTs este mes</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>OT</th><th>Cliente</th><th>Tipo</th><th>Responsable</th><th>Avance</th><th>SLA</th><th>Estado</th></tr></thead>
                <tbody>
                  {otsMes.map(o => (
                    <tr key={o.id} className="hover-row">
                      <td className="mono" style={{fontWeight:600}}>{o.numero}</td>
                      <td><strong>{o.cliente}</strong></td>
                      <td><span className="badge badge-cyan" style={{fontSize:11}}>{o.tipo}</span></td>
                      <td>{o.responsable}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:80,height:6,background:'var(--bg-subtle)',borderRadius:3}}>
                            <div style={{width:(o.avance||0)+'%',height:'100%',background:o.avance===100?'var(--green)':o.avance>50?'var(--cyan)':'var(--orange)',borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:12,fontWeight:600,minWidth:28}}>{o.avance||0}%</span>
                        </div>
                      </td>
                      <td><span className={'badge '+(o.sla==='ok'?'badge-green':'badge-orange')}>{(o.sla || '').toUpperCase()}</span></td>
                      <td><span className={'badge '+(o.estado==='cerrada'?'badge-purple':o.estado==='ejecucion'?'badge-cyan':'badge-gray')}>{o.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'recursos' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>OTs por Técnico</h3></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:16}}>
                {Object.entries(respMap).sort((a,b)=>b[1].total-a[1].total).map(([resp, data], i) => (
                  <div key={i}>
                    <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                      <span style={{fontSize:13, fontWeight:500}}>{resp}</span>
                      <span style={{fontSize:12, color:'var(--fg-muted)'}}>{data.total} OTs · {data.horas}h</span>
                    </div>
                    <div style={{display:'flex', height:8, borderRadius:4, overflow:'hidden'}}>
                      <div style={{flex:data.cerradas, background:'var(--green)'}}/>
                      <div style={{flex:data.total-data.cerradas, background:'var(--cyan)', opacity:0.5}}/>
                    </div>
                    <div style={{display:'flex', gap:12, marginTop:4, fontSize:11, color:'var(--fg-muted)'}}>
                      <span style={{color:'var(--green)'}}>■ {data.cerradas} cerradas</span>
                      <span style={{color:'var(--cyan)'}}>■ {data.total-data.cerradas} en curso</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Eficiencia de Costo</h3><span className="badge badge-cyan">Real vs. Estimado</span></div>
              <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:14}}>
                {otsCerDat.map(o => {
                  const pct = o.costoEst > 0 ? Math.round((o.costoReal||0)/o.costoEst*100) : 0;
                  return (
                    <div key={o.id} style={{display:'grid', gridTemplateColumns:'110px 1fr 46px', gap:10, alignItems:'center'}}>
                      <span className="mono" style={{fontSize:12}}>{o.numero}</span>
                      <div style={{height:8, background:'var(--bg-subtle)', borderRadius:4}}>
                        <div style={{width:Math.min(pct,100)+'%', height:'100%', background:pct>100?'var(--danger)':pct>90?'var(--orange)':'var(--green)', borderRadius:4}}/>
                      </div>
                      <span style={{fontSize:12, fontWeight:700, textAlign:'right', color:pct>100?'var(--danger)':pct>90?'var(--orange)':'var(--green)'}}>{pct}%</span>
                    </div>
                  );
                })}
                <div style={{padding:'12px 0', borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', fontSize:13}}>
                  <span className="text-muted">Eficiencia promedio</span>
                  <strong style={{color:eficiencia<=100?'var(--green)':'var(--danger)'}}>{eficiencia}%</strong>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Partes diarios registrados</h3><span className="badge badge-cyan">{partes.length}</span></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Parte</th><th>OT</th><th>Técnico</th><th>Fecha</th><th>Horas</th><th>Avance</th><th>Estado</th></tr></thead>
                <tbody>
                  {partes.map(p => (
                    <tr key={p.id} className="hover-row">
                      <td className="mono" style={{fontWeight:600}}>{p.id}</td>
                      <td className="mono text-muted">{ots.find(o=>o.id===p.ot_id)?.numero||p.ot_id}</td>
                      <td>{p.tecnico}</td>
                      <td className="text-muted">{p.fecha}</td>
                      <td className="num" style={{fontWeight:600}}>{p.horas}h</td>
                      <td><span className="badge badge-cyan">{p.avance_reportado}%</span></td>
                      <td><span className={'badge '+(p.estado==='aprobado'?'badge-green':'badge-orange')}>{p.estado.replace('_',' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'backlog' && (
        <div style={{display:'grid', gap:20}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
            <div className="card">
              <div className="card-head"><h3>Backlog pendiente</h3><span className="badge badge-orange">{bkPend.length}</span></div>
              <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:16}}>
                {[{k:'alta',l:'Alta prioridad',color:'var(--danger)',b:'badge-red'},{k:'media',l:'Media prioridad',color:'var(--orange)',b:'badge-orange'},{k:'baja',l:'Baja prioridad',color:'var(--green)',b:'badge-green'}].map(pr => (
                  <div key={pr.k} className="row" style={{justifyContent:'space-between', padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid '+pr.color}}>
                    <span style={{fontSize:13, fontWeight:500}}>{pr.l}</span>
                    <span className={'badge '+pr.b} style={{fontSize:14, padding:'2px 12px'}}>{bkPriority[pr.k]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>OTs con SLA en riesgo</h3></div>
              <div style={{padding:'16px 24px'}}>
                {otsMes.filter(o=>o.sla!=='ok').length === 0 ? (
                  <div style={{textAlign:'center', padding:32, color:'var(--green)'}}>
                    <div style={{fontSize:28, marginBottom:8}}>✓</div>
                    <div style={{fontWeight:600}}>Sin OTs con SLA en riesgo</div>
                  </div>
                ) : otsMes.filter(o=>o.sla!=='ok').map(o => (
                  <div key={o.id} style={{padding:'12px', border:'1px solid var(--border)', borderRadius:8, marginBottom:12, borderLeft:'3px solid var(--danger)'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong className="mono">{o.numero}</strong>
                      <span className="badge badge-orange">{(o.sla || '').toUpperCase()}</span>
                    </div>
                    <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:4}}>{o.cliente} · {o.responsable}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Requerimientos pendientes de programación</h3></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>ID</th><th>Prioridad</th><th>Cliente</th><th>Título</th><th>Origen</th><th>Fecha</th></tr></thead>
                <tbody>
                  {bkPend.map(b => {
                    const cuenta = cuentas.find(c=>c.id===b.cuenta_id);
                    return (
                      <tr key={b.id} className="hover-row">
                        <td className="mono">{b.id}</td>
                        <td><span className={'badge '+(b.prioridad==='alta'?'badge-red':b.prioridad==='media'?'badge-orange':'badge-green')}>{(b.prioridad || '').toUpperCase()}</span></td>
                        <td><strong>{cuenta?.razon_social||b.cuenta_id}</strong></td>
                        <td style={{maxWidth:200}}>{b.titulo}</td>
                        <td className="text-muted" style={{fontSize:12}}>{b.origen}</td>
                        <td className="text-muted">{b.fecha}</td>
                      </tr>
                    );
                  })}
                  {bkPend.length===0 && <tr><td colSpan="6" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>Backlog limpio</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ AGENDA COMERCIAL ============
function AgendaComercial() {
  const { agendaEventos, cuentas, role, usuarios, roles, authUser, crearAgendaEvento, actualizarAgendaEvento, registrarActividad, searchQuery } = useApp();
  const getAgendaCuentaNombre = (id) => cuentas.find(c => c.id === id)?.razon_social || id;

  const [view, setView] = useState('calendario'); // 'calendario' | 'semana' | 'dia' | 'lista'
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [eventoRealizado, setEventoRealizado] = useState(null);
  const [panelNuevoEvento, setPanelNuevoEvento] = useState(false);
  const eventoFormBase = {
    tipo: 'reunion',
    titulo: '',
    cuenta_id: '',
    vendedor: '',
    fecha: new Date().toISOString().split('T')[0],
    hora: '09:00',
    duracion_minutos: 60,
    notas: '',
  };
  const [eventoForm, setEventoForm] = useState(eventoFormBase);
  const comercialesAsignables = getAssignableUsers({ users: usuarios, roles, categories: ['comercial'], includeAdmins: true, viewer: authUser });
  const cuentasVisibles = cuentas.filter(c => canUserSeeOwner({ viewer: authUser, ownerUserId: c.responsable_id, ownerName: c.responsable_comercial, users: usuarios, roles }));
  const updateEventoForm = (field, value) => setEventoForm(prev => ({ ...prev, [field]: value }));
  const cerrarNuevoEvento = () => {
    setPanelNuevoEvento(false);
    setEventoForm(eventoFormBase);
  };
  const guardarNuevoEvento = (event) => {
    event.preventDefault();
    const vendedor = comercialesAsignables.find(u => u.id === eventoForm.vendedor)?.nombre || eventoForm.vendedor || 'Por asignar';
    crearAgendaEvento({
      titulo: eventoForm.titulo || 'Nuevo evento comercial',
      tipo: eventoForm.tipo || 'reunion',
      cuenta_id: eventoForm.cuenta_id || null,
      vendedor,
      registrado_por: vendedor,
      fecha: eventoForm.fecha,
      hora: eventoForm.hora,
      duracion_minutos: Number(eventoForm.duracion_minutos || 60),
      estado: 'programado',
      notas: eventoForm.notas || null,
    });
    cerrarNuevoEvento();
  };
  const [mesVisible, setMesVisible] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);

  const viewer = usuarios.find(u => u.id === authUser?.id || u.email === authUser?.email)
    || usuarios.find(u => u.nombre === 'Carla Meza');
  const puedeVerEquipo = Boolean(
    role.permisos?.ver_agenda_equipo ||
    role.permisos?.tenant_admin ||
    role.permisos?.plataforma ||
    ['direccion', 'jefatura', 'supervisor'].includes(String(viewer?.nivel_jerarquico || '').toLowerCase())
  );

  const query = searchQuery.toLowerCase();
  const eventosFiltrados = agendaEventos.filter(e => {
    if (!canUserSeeOwner({ viewer, ownerName: e.vendedor, users: usuarios, roles })) return false;
    if (filtroVendedor && e.vendedor !== filtroVendedor) return false;
    if (filtroTipo && e.tipo !== filtroTipo) return false;
    
    const matchesQuery = !query || 
      e.titulo.toLowerCase().includes(query) ||
      (e.tipo || '').toLowerCase().includes(query) ||
      getAgendaCuentaNombre(e.cuenta_id).toLowerCase().includes(query) ||
      (e.vendedor || '').toLowerCase().includes(query);
      
    return matchesQuery;
  });

  const getIcon = (tipo) => {
    switch(tipo) {
      case 'llamada': return I.phone;
      case 'reunion': return I.users;
      case 'visita': return I.mapPin;
      case 'demo': return I.sparkles;
      default: return I.calendar;
    }
  };

  const getBadgeColor = (estado) => {
    switch(estado) {
      case 'programado': return 'badge-cyan';
      case 'realizado': return 'badge-green';
      case 'cancelado': return 'badge-red';
      case 'reprogramado': return 'badge-orange';
      default: return 'badge-purple';
    }
  };
  const getRegistrador = (evento) => evento.registrado_por || evento.vendedor || 'Sin asignar';

  const today = new Date().toISOString().split('T')[0];
  const eventosHoy = eventosFiltrados.filter(e => e.fecha === today);
  const realizados = eventosFiltrados.filter(e => e.estado === 'realizado').length;
  const tasaRealizacion = eventosFiltrados.length ? Math.round((realizados / eventosFiltrados.length) * 100) : 0;

  const uniqueVendedores = [...new Set(agendaEventos.map(e => e.vendedor))];
  const parseISODate = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const dateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const getWeekStart = (date) => {
    const d = new Date(date);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  };
  const hourFromEvent = (event) => Number(String(event.hora || '00:00').split(':')[0]);
  const eventosPorDia = (key) => eventosFiltrados
    .filter(e => e.fecha === key)
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  const monthLabel = mesVisible.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const selectedDate = parseISODate(fechaSeleccionada);
  const semanaInicio = getWeekStart(selectedDate);
  const diasSemana = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(semanaInicio);
    d.setDate(semanaInicio.getDate() + idx);
    const key = dateKey(d);
    return { date: d, key, events: eventosPorDia(key), isToday: key === today, isSelected: key === fechaSeleccionada };
  });
  const horasAgenda = Array.from({ length: 14 }, (_, idx) => 6 + idx);
  const rangeSemana = `${diasSemana[0].date.toLocaleDateString('es-PE', { day:'numeric', month:'short' })} - ${diasSemana[6].date.toLocaleDateString('es-PE', { day:'numeric', month:'short', year:'numeric' })}`;
  const calendarTitle = view === 'calendario'
    ? monthLabel
    : view === 'semana'
      ? rangeSemana
      : selectedDate.toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const navegarCalendario = (delta) => {
    if (view === 'calendario') {
      setMesVisible(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
      return;
    }
    const d = parseISODate(fechaSeleccionada);
    d.setDate(d.getDate() + (view === 'semana' ? delta * 7 : delta));
    setFechaSeleccionada(dateKey(d));
    setMesVisible(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const irHoy = () => {
    const d = new Date();
    setMesVisible(new Date(d.getFullYear(), d.getMonth(), 1));
    setFechaSeleccionada(dateKey(d));
  };
  const primerDiaMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const offsetLunes = (primerDiaMes.getDay() + 6) % 7;
  const inicioGrid = new Date(primerDiaMes);
  inicioGrid.setDate(primerDiaMes.getDate() - offsetLunes);
  const diasCalendario = Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(inicioGrid);
    d.setDate(inicioGrid.getDate() + idx);
    const key = dateKey(d);
    return {
      date: d,
      key,
      isCurrentMonth: d.getMonth() === mesVisible.getMonth(),
      isToday: key === today,
      isSelected: key === fechaSeleccionada,
      events: eventosFiltrados
        .filter(e => e.fecha === key)
        .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')))
    };
  });
  const eventosSeleccionados = eventosFiltrados
    .filter(e => e.fecha === fechaSeleccionada)
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));

  const cerrarEventoRealizado = (e) => {
    e.preventDefault();
    if (!eventoRealizado) return;
    const fd = new FormData(e.target);
    const resultado = String(fd.get('resultado') || '').trim();
    const proximaAccion = String(fd.get('proxima_accion') || '').trim();
    const proximaAccionFecha = fd.get('proxima_accion_fecha') || null;

    actualizarAgendaEvento(eventoRealizado.id, {
      estado: 'realizado',
      resultado,
      updated_at: new Date().toISOString(),
    });

    registrarActividad({
      tipo: eventoRealizado.tipo,
      vinculo_tipo: eventoRealizado.oportunidad_id ? 'oportunidad' : eventoRealizado.lead_id ? 'lead' : eventoRealizado.cuenta_id ? 'cuenta' : 'agenda',
      vinculo_id: eventoRealizado.oportunidad_id || eventoRealizado.lead_id || eventoRealizado.cuenta_id || eventoRealizado.id,
      cuenta_id: eventoRealizado.cuenta_id || null,
      oportunidad_id: eventoRealizado.oportunidad_id || null,
      lead_id: eventoRealizado.lead_id || null,
      responsable: eventoRealizado.vendedor || getRegistrador(eventoRealizado),
      fecha: eventoRealizado.fecha,
      hora: eventoRealizado.hora,
      descripcion: eventoRealizado.titulo,
      resultado,
      proxima_accion: proximaAccion || null,
      proxima_accion_fecha: proximaAccionFecha || null,
      estado: 'completada',
    });

    setEventoRealizado(null);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agenda Comercial</h1>
          <div className="page-sub">Planificación de visitas, reuniones y demos del equipo</div>
        </div>
        <div className="row">
          <div className="segmented-control" style={{background:'var(--bg)', border:'1px solid var(--border)'}}>
            <button className={`seg-btn ${view==='calendario'?'active':''}`} onClick={()=>setView('calendario')}>{I.calendar} Mes</button>
            <button className={`seg-btn ${view==='semana'?'active':''}`} onClick={()=>setView('semana')}>Semana</button>
            <button className={`seg-btn ${view==='dia'?'active':''}`} onClick={()=>setView('dia')}>Dia</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-primary" data-local-form="true" onClick={() => setPanelNuevoEvento(true)}>{I.plus} Nuevo evento</button>
        </div>
      </div>

      <div className="grid-3" style={{marginBottom: 20}}>
        <div className="card" style={{padding: 16}}>
          <div className="text-muted" style={{fontSize:12}}>Eventos Programados (Hoy)</div>
          <div style={{fontSize: 24, fontWeight: 700}}>{eventosHoy.length}</div>
        </div>
        <div className="card" style={{padding: 16}}>
          <div className="text-muted" style={{fontSize:12}}>Tasa de Realización (Mes)</div>
          <div style={{fontSize: 24, fontWeight: 700, color: 'var(--green)'}}>{tasaRealizacion}%</div>
        </div>
        <div className="card" style={{padding: 16}}>
          <div className="text-muted" style={{fontSize:12}}>Total Eventos ({puedeVerEquipo ? 'Equipo' : 'Mis eventos'})</div>
          <div style={{fontSize: 24, fontWeight: 700}}>{eventosFiltrados.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="row" style={{gap:16}}>
            {puedeVerEquipo && (
              <div className="input-group" style={{margin:0}}>
                <select className="select" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
                  <option value="">Todos los vendedores</option>
                  {uniqueVendedores.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <div className="input-group" style={{margin:0}}>
              <select className="select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="visita">Visitas</option>
                <option value="reunion">Reuniones</option>
                <option value="llamada">Llamadas</option>
                <option value="demo">Demos</option>
              </select>
            </div>
          </div>
        </div>

        {view === 'lista' ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Tipo</th>
                  <th>Título / Prospecto</th>
                  <th>Registrado por</th>
                  <th>Duración</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {eventosFiltrados.map(e => (
                  <tr key={e.id} className="hover-row">
                    <td><strong>{e.fecha}</strong> <span className="text-muted">{e.hora}</span></td>
                    <td>
                      <div className="row" style={{gap:6, textTransform:'capitalize'}}>
                        <span style={{width:16, display:'flex', alignItems:'center', justifyContent:'center'}}>{getIcon(e.tipo)}</span>
                        {e.tipo}
                      </div>
                    </td>
                    <td>
                      <div>{e.titulo}</div>
                      <div className="text-muted" style={{fontSize:12}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'}</div>
                    </td>
                    <td>{getRegistrador(e)}</td>
                    <td>{e.duracion_minutos} min</td>
                    <td><span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span></td>
                  </tr>
                ))}
                {eventosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                      No hay eventos programados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : view === 'calendario' ? (
          <div className="commercial-calendar">
            <div className="calendar-toolbar">
              <div className="row" style={{gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={irHoy}>Hoy</button>
                <button className="icon-btn" onClick={() => navegarCalendario(-1)} title="Anterior">{'<'}</button>
                <button className="icon-btn" onClick={() => navegarCalendario(1)} title="Siguiente">{'>'}</button>
                <div className="calendar-title">{calendarTitle}</div>
              </div>
              <div className="calendar-legend">
                <span><i className="dot dot-visita"/> Visita</span>
                <span><i className="dot dot-reunion"/> Reunion</span>
                <span><i className="dot dot-llamada"/> Llamada</span>
                <span><i className="dot dot-demo"/> Demo</span>
              </div>
            </div>
            <div className="calendar-layout">
              <div className="month-calendar">
                {['LUN','MAR','MIE','JUE','VIE','SAB','DOM'].map(day => (
                  <div key={day} className="calendar-weekday">{day}</div>
                ))}
                {diasCalendario.map(day => (
                  <button
                    key={day.key}
                    className={[
                      'calendar-day',
                      day.isCurrentMonth ? '' : 'muted',
                      day.isToday ? 'today' : '',
                      day.isSelected ? 'selected' : ''
                    ].filter(Boolean).join(' ')}
                    onClick={() => setFechaSeleccionada(day.key)}
                  >
                    <div className="calendar-day-head">
                      <span>{day.date.getDate()}</span>
                      {day.events.length > 0 && <strong>{day.events.length}</strong>}
                    </div>
                    <div className="calendar-events">
                      {day.events.slice(0, 3).map(e => (
                        <div key={e.id} className={`calendar-event event-${e.tipo}`}>
                          <span>{e.hora}</span>
                          <strong>{e.titulo}</strong>
                          <em>{getRegistrador(e)}</em>
                        </div>
                      ))}
                      {day.events.length > 3 && <div className="calendar-more">+{day.events.length - 3} mas</div>}
                    </div>
                  </button>
                ))}
              </div>
              <aside className="calendar-day-panel">
                <div className="eyebrow">Dia seleccionado</div>
                <h3>{parseISODate(fechaSeleccionada).toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long' })}</h3>
                <div className="calendar-day-list">
                  {eventosSeleccionados.map(e => (
                    <div key={e.id} className={`calendar-detail event-${e.tipo}`}>
                      <div className="row" style={{justifyContent:'space-between', gap:10}}>
                        <strong>{e.hora} - {e.titulo}</strong>
                        <span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span>
                      </div>
                      <div className="text-muted" style={{fontSize:12}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'} - {e.tipo} - {e.duracion_minutos} min</div>
                      <div className="calendar-owner">{I.user} Registrado por: {getRegistrador(e)}</div>
                      {e.estado !== 'realizado' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => setEventoRealizado(e)}>
                          {I.check} Realizado
                        </button>
                      )}
                    </div>
                  ))}
                  {eventosSeleccionados.length === 0 && (
                    <div className="calendar-empty">No hay eventos para este dia.</div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        ) : view === 'semana' ? (
          <div className="commercial-calendar">
            <div className="calendar-toolbar">
              <div className="row" style={{gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={irHoy}>Hoy</button>
                <button className="icon-btn" onClick={() => navegarCalendario(-1)} title="Semana anterior">{'<'}</button>
                <button className="icon-btn" onClick={() => navegarCalendario(1)} title="Semana siguiente">{'>'}</button>
                <div className="calendar-title">{calendarTitle}</div>
              </div>
              <div className="calendar-legend">
                <span><i className="dot dot-visita"/> Visita</span>
                <span><i className="dot dot-reunion"/> Reunion</span>
                <span><i className="dot dot-llamada"/> Llamada</span>
                <span><i className="dot dot-demo"/> Demo</span>
              </div>
            </div>
            <div className="week-calendar">
              <div className="week-head week-time">GMT-05</div>
              {diasSemana.map(day => (
                <button
                  key={day.key}
                  className={`week-head ${day.isToday ? 'today' : ''} ${day.isSelected ? 'selected' : ''}`}
                  onClick={() => setFechaSeleccionada(day.key)}
                >
                  <span>{day.date.toLocaleDateString('es-PE', { weekday:'short' })}</span>
                  <strong>{day.date.getDate()}</strong>
                </button>
              ))}
              {horasAgenda.map(hour => (
                <React.Fragment key={hour}>
                  <div className="week-time">{String(hour).padStart(2, '0')}:00</div>
                  {diasSemana.map(day => {
                    const events = day.events.filter(e => hourFromEvent(e) === hour);
                    return (
                      <div key={`${day.key}-${hour}`} className="week-slot">
                        {events.map(e => (
                          <div key={e.id} className={`week-event event-${e.tipo}`}>
                            <strong>{e.hora} {e.titulo}</strong>
                            <span>{getRegistrador(e)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : view === 'dia' ? (
          <div className="commercial-calendar">
            <div className="calendar-toolbar">
              <div className="row" style={{gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={irHoy}>Hoy</button>
                <button className="icon-btn" onClick={() => navegarCalendario(-1)} title="Dia anterior">{'<'}</button>
                <button className="icon-btn" onClick={() => navegarCalendario(1)} title="Dia siguiente">{'>'}</button>
                <div className="calendar-title">{calendarTitle}</div>
              </div>
            </div>
            <div className="day-calendar">
              {horasAgenda.map(hour => {
                const events = eventosSeleccionados.filter(e => hourFromEvent(e) === hour);
                return (
                  <div key={hour} className="day-hour">
                    <div className="week-time">{String(hour).padStart(2, '0')}:00</div>
                    <div className="day-slot">
                      {events.map(e => (
                        <div key={e.id} className={`day-event event-${e.tipo}`}>
                          <div className="row" style={{justifyContent:'space-between', gap:10}}>
                            <strong>{e.hora} - {e.titulo}</strong>
                            <span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span>
                          </div>
                          <div className="text-muted" style={{fontSize:12}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'} - {e.tipo} - {e.duracion_minutos} min</div>
                          <div className="calendar-owner">{I.user} Registrado por: {getRegistrador(e)}</div>
                          {e.estado !== 'realizado' && (
                            <button className="btn btn-sm btn-secondary" onClick={() => setEventoRealizado(e)}>
                              {I.check} Realizado
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {eventosSeleccionados.length === 0 && (
                <div className="calendar-empty" style={{margin:16}}>No hay eventos para este dia.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{padding: 20}}>
            {/* Visualización simplificada de calendario tipo agenda */}
            <div className="eyebrow" style={{marginBottom: 10}}>Próximos eventos</div>
            <div className="col" style={{gap: 12}}>
              {eventosFiltrados.sort((a,b) => a.fecha.localeCompare(b.fecha)).map(e => (
                <div key={e.id} className="row card hover-raise" style={{padding: 14, gap: 16, borderLeft: `4px solid var(--${e.tipo==='visita'?'green':e.tipo==='reunion'?'cyan':'purple'})`}}>
                  <div style={{textAlign: 'center', minWidth: 60}}>
                    <div style={{fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase'}}>{new Date(e.fecha).toLocaleDateString('es-ES', {weekday: 'short'})}</div>
                    <div style={{fontSize: 20, fontWeight: 800}}>{new Date(e.fecha).getDate()}</div>
                    <div style={{fontSize: 12, color: 'var(--fg-muted)'}}>{e.hora}</div>
                  </div>
                  <div style={{flex: 1}}>
                    <div className="row" style={{justifyContent: 'space-between', marginBottom: 4}}>
                      <div style={{fontWeight: 600, fontSize: 15}}>{e.titulo}</div>
                      <span className={'badge ' + getBadgeColor(e.estado)}>{e.estado}</span>
                    </div>
                    <div className="text-muted" style={{fontSize: 13, marginBottom: 8}}>{e.cuenta_id ? getAgendaCuentaNombre(e.cuenta_id) : 'Lead'}</div>
                    <div className="row" style={{gap: 12, fontSize: 12, color: 'var(--fg-muted)'}}>
                      <span className="row" style={{gap:4}}><span style={{width:14, height:14}}>{getIcon(e.tipo)}</span> {e.tipo}</span>
                      <span className="row" style={{gap:4}}><span style={{width:14, height:14}}>{I.user}</span> {getRegistrador(e)}</span>
                    </div>
                  </div>
                  <div className="row" style={{gap:8}}>
                    {e.estado !== 'realizado' && (
                      <button className="btn btn-sm btn-secondary" onClick={() => setEventoRealizado(e)}>
                        {I.check} Realizado
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {eventoRealizado && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Cerrar evento de agenda</div>
                <h2>{eventoRealizado.titulo}</h2>
              </div>
              <button className="icon-btn" onClick={() => setEventoRealizado(null)}>{I.x}</button>
            </div>
            <form className="modal-body col" style={{gap:16}} onSubmit={cerrarEventoRealizado}>
              <div className="grid-2">
                <div>
                  <div className="eyebrow">Fecha y hora</div>
                  <div style={{fontWeight:700}}>{eventoRealizado.fecha} {eventoRealizado.hora}</div>
                </div>
                <div>
                  <div className="eyebrow">Comercial</div>
                  <div style={{fontWeight:700}}>{eventoRealizado.vendedor || getRegistrador(eventoRealizado)}</div>
                </div>
              </div>
              <div className="input-group">
                <label>Resultado de la reunion / visita</label>
                <textarea name="resultado" className="input" rows="4" required placeholder="Ej: Cliente confirma interes, solicita propuesta con alcance ajustado."></textarea>
              </div>
              <div className="input-group">
                <label>Proxima accion</label>
                <input name="proxima_accion" className="input" placeholder="Ej: Enviar cotizacion actualizada" />
              </div>
              <div className="input-group">
                <label>Fecha proxima accion</label>
                <input name="proxima_accion_fecha" type="date" className="input" />
              </div>
              <div className="modal-foot mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setEventoRealizado(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.check} Marcar realizado y crear actividad</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {panelNuevoEvento && (
        <>
          <div className="side-panel-backdrop" onClick={cerrarNuevoEvento}/>
          <div className="side-panel" style={{width:'min(560px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Formulario de registro</div>
                <div className="font-display" style={{fontSize:22,fontWeight:700,marginTop:2}}>Nuevo evento</div>
              </div>
              <button className="icon-btn" onClick={cerrarNuevoEvento}>{I.x}</button>
            </div>
            <form className="side-panel-body" onSubmit={guardarNuevoEvento}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:'var(--fg-muted)'}}>Datos del evento</div>
              <div className="grid-2" style={{gap:14,marginBottom:20}}>
                <div className="input-group">
                  <label>Tipo</label>
                  <select className="select" value={eventoForm.tipo} onChange={e=>updateEventoForm('tipo',e.target.value)}>
                    {['visita','reunion','llamada','demo','tarea'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Fecha</label>
                  <input className="input" type="date" required value={eventoForm.fecha} onChange={e=>updateEventoForm('fecha',e.target.value)}/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Título *</label>
                  <input className="input" required value={eventoForm.titulo} onChange={e=>updateEventoForm('titulo',e.target.value)} placeholder="Ej: Reunión de levantamiento con cliente" autoFocus/>
                </div>
                <div className="input-group">
                  <label>Cuenta</label>
                  <select className="select" value={eventoForm.cuenta_id} onChange={e=>updateEventoForm('cuenta_id',e.target.value)}>
                    <option value="">Sin cuenta vinculada</option>
                    {cuentasVisibles.map(c => <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Responsable comercial *</label>
                  <select className="select" required value={eventoForm.vendedor} onChange={e=>updateEventoForm('vendedor',e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {comercialesAsignables.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Hora</label>
                  <input className="input" type="time" required value={eventoForm.hora} onChange={e=>updateEventoForm('hora',e.target.value)}/>
                </div>
                <div className="input-group">
                  <label>Duración (min)</label>
                  <input className="input" type="number" min="15" step="15" value={eventoForm.duracion_minutos} onChange={e=>updateEventoForm('duracion_minutos',e.target.value)}/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Notas</label>
                  <textarea className="input" rows={3} value={eventoForm.notas} onChange={e=>updateEventoForm('notas',e.target.value)} placeholder="Objetivo, agenda o preparación requerida"/>
                </div>
              </div>
              <div className="row" style={{justifyContent:'flex-end',gap:10}}>
                <button type="button" className="btn btn-secondary" onClick={cerrarNuevoEvento}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{I.plus} Crear evento</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

export { Dashboard, Leads, Marketing, BIComercial, BIOperativo, Pipeline, Actividades, AgendaComercial, OSCliente };

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { usePermisoPantalla } from './confiabilidadPermisos.js';
import { AvisoVistaConsolidada } from './confiabilidadUi.jsx';
import {
  listarActivosPorSegmento,
  listarBacklog,
  guardarBacklog,
  cambiarCicloBacklog,
} from '../../../services/confiabilidadService.js';
import {
  etiquetaConfiabilidad,
  puntajeBacklog,
  prioridadBacklog,
  transicionBacklogValida,
} from './confiabilidadLogic.js';

const sistemas = [
  'Motor',
  'Transmisión',
  'Hidráulico',
  'Eléctrico',
  'Estructura',
  'Tren de rodaje',
  'Frenos',
  'Dirección',
  'Mandos finales',
  'Neumático',
  'Otro',
];
const fuentes = ['manual', 'diagnostico', 'parte_diario', 'pm', 'sos', 'inspeccion'];
const ciclos = ['nuevo', 'evaluado', 'pendiente_recursos', 'listo_para_ot', 'en_ot', 'cerrado', 'descartado'];
const prioridades = ['emergencia', 'urgente', 'programable', 'baja'];
const segmentos = { todos: 'Todos', flota: 'Flota', taller: 'Taller', cliente: 'Cliente' };
const niveles = {
  impacto: [
    '1 · Menor, sin afectar la operación',
    '2 · Bajo, afectación limitada',
    '3 · Moderado, reduce el desempeño',
    '4 · Alto, interrumpe la operación',
    '5 · Crítico, compromete seguridad u operación',
  ],
  urgencia: [
    '1 · Puede esperar a la programación',
    '2 · Atención en una próxima intervención',
    '3 · Atención dentro del plazo normal',
    '4 · Atención prioritaria',
    '5 · Atención inmediata',
  ],
};
const normal = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const nombreEquipo = (a) => (a ? [a.codigo, a.nombre].filter(Boolean).join(' · ') || 'Sin dato' : 'Sin dato');
const etiquetaPrioridad = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Sin dato');
const edad = (r) => {
  const f = r.fecha_deteccion || r.created_at;
  if (!f) return null;
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};
const dinero = (v, moneda) =>
  v == null || v === '' || !moneda
    ? 'Sin dato'
    : `${moneda} ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vacio = () => ({
  activo_id: '',
  sistema: '',
  descripcion: '',
  fuente: 'manual',
  fuente_id: '',
  impacto: '',
  urgencia: '',
  costo_estimado: '',
  moneda: 'PEN',
  fecha_deteccion: '',
});

export function BacklogOperativoPage({ onNav }) {
  const sesion = useSesionOperativa();
  const permisos = usePermisoPantalla('backlog');
  const [rows, setRows] = useState([]),
    [activos, setActivos] = useState([]);
  const [cargando, setCargando] = useState(true),
    [error, setError] = useState('');
  const [segmento, setSegmento] = useState('todos'),
    [ciclo, setCiclo] = useState(''),
    [prioridad, setPrioridad] = useState(''),
    [fuente, setFuente] = useState(''),
    [sistema, setSistema] = useState(''),
    [q, setQ] = useState(''),
    [vista, setVista] = useState('lista');
  const [form, setForm] = useState(null),
    [original, setOriginal] = useState(''),
    [errores, setErrores] = useState({}),
    [modalError, setModalError] = useState(''),
    [ocupado, setOcupado] = useState(false),
    [confirmarCerrar, setConfirmarCerrar] = useState(false),
    [motivo, setMotivo] = useState(null),
    [buscarEquipo, setBuscarEquipo] = useState(''),
    [selector, setSelector] = useState(false);
  const formRef = useRef(null);
  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [b, a] = await Promise.all([
        listarBacklog(sesion.empresaId, sesion.sociedadId),
        listarActivosPorSegmento(sesion.empresaId),
      ]);
      setRows(b);
      setActivos(a.filter((x) => x.estado !== 'dado_baja'));
    } catch (e) {
      setError(e.message || 'No se pudo cargar el backlog.');
    } finally {
      setCargando(false);
    }
  }, [sesion.empresaId, sesion.sociedadId]);
  useEffect(() => {
    if (permisos?.ver) cargar();
  }, [permisos.ver, cargar]);
  const activosPorId = useMemo(() => new Map(activos.map((a) => [String(a.id), a])), [activos]);
  const equipoDe = (r) => activosPorId.get(String(r.activo_id)) || r.activo;
  const porSegmento = rows.filter((r) => segmento === 'todos' || equipoDe(r)?.segmento === segmento);
  const abiertos = porSegmento.filter((r) => !['cerrado', 'descartado'].includes(r.ciclo));
  const edades = abiertos.map(edad).filter((x) => x != null);
  const costos =
    Object.entries(
      abiertos.reduce((acc, r) => {
        if (r.moneda && r.costo_estimado != null) acc[r.moneda] = (acc[r.moneda] || 0) + Number(r.costo_estimado);
        return acc;
      }, {}),
    )
      .map(([m, v]) => dinero(v, m))
      .join(' / ') || 'Sin dato';
  const visibles = porSegmento.filter(
    (r) =>
      (!ciclo || (r.ciclo || 'nuevo') === ciclo) &&
      (!prioridad || r.prioridad_calculada === prioridad) &&
      (!fuente || r.fuente === fuente) &&
      (!sistema || r.sistema === sistema) &&
      normal(`${equipoDe(r)?.codigo || ''} ${r.descripcion || ''}`).includes(normal(q)),
  );
  const abrir = (r) => {
    const f = r
      ? {
          ...vacio(),
          ...r,
          impacto: r.impacto ?? '',
          urgencia: r.urgencia ?? '',
          costo_estimado: r.costo_estimado ?? '',
        }
      : vacio();
    setForm(f);
    setOriginal(JSON.stringify(f));
    setErrores({});
    setModalError('');
    setMotivo(null);
    setBuscarEquipo('');
    setSelector(false);
    setConfirmarCerrar(false);
  };
  const cerrar = () => {
    if (JSON.stringify(form) !== original) setConfirmarCerrar(true);
    else setForm(null);
  };
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const guardar = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.descripcion?.trim()) errs.descripcion = 'Ingrese la descripción.';
    if (!puntajeBacklog(form.impacto, form.urgencia)) {
      if (!form.impacto) errs.impacto = 'Seleccione el impacto.';
      if (!form.urgencia) errs.urgencia = 'Seleccione la urgencia.';
    }
    if (
      form.costo_estimado !== '' &&
      (!Number.isFinite(Number(form.costo_estimado)) || Number(form.costo_estimado) < 0)
    )
      errs.costo_estimado = 'Ingrese un costo válido.';
    setErrores(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector(`[name="${Object.keys(errs)[0]}"]`)?.focus();
      return;
    }
    setOcupado(true);
    setModalError('');
    try {
      const payload = Object.fromEntries(
        [
          'id',
          'activo_id',
          'sistema',
          'descripcion',
          'fuente',
          'fuente_id',
          'impacto',
          'urgencia',
          'costo_estimado',
          'moneda',
          'fecha_deteccion',
        ]
          .filter((k) => form[k] !== undefined)
          .map((k) => [k, form[k]]),
      );
      await guardarBacklog({
        ...payload,
        empresa_id: sesion.empresaId,
        sociedad_id: form.sociedad_id ?? sesion.sociedadId ?? null,
      });
      setForm(null);
      await cargar();
    } catch (ex) {
      setModalError(ex.message || 'No se pudo guardar el hallazgo.');
    } finally {
      setOcupado(false);
    }
  };
  const cambiar = async (destino, texto = '') => {
    if (JSON.stringify(form) !== original) {
      setModalError('Guarde o descarte los cambios antes de cambiar el ciclo.');
      return;
    }
    if (!transicionBacklogValida(form.ciclo || 'nuevo', destino, texto)) {
      setErrores({ motivo: 'Ingrese el motivo del descarte.' });
      return;
    }
    setOcupado(true);
    setModalError('');
    try {
      await cambiarCicloBacklog(form.id, destino, texto || null);
      setForm(null);
      await cargar();
    } catch (ex) {
      setModalError(ex.message || 'No se pudo cambiar el ciclo.');
    } finally {
      setOcupado(false);
    }
  };
  const crearOt = () => {
    if (JSON.stringify(form) !== original) {
      setModalError('Guarde o descarte los cambios antes de crear la OT.');
      return;
    }
    localStorage.setItem(
      'zahory_ot_contexto',
      JSON.stringify({
        backlog_id: form.id,
        equipo_id: form.activo_id,
        descripcion: form.descripcion,
        tipo_trabajo: 'Correctivo',
        origen: 'backlog',
      }),
    );
    onNav('crear-ot');
  };
  const fila = (r) => (
    <div
      key={r.id}
      className="dx-ui-row dx-confbl-cols"
      role="button"
      tabIndex={0}
      onClick={() => abrir(r)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          abrir(r);
        }
      }}
    >
      <span>
        <b>{nombreEquipo(equipoDe(r))}</b>
        <small>{etiquetaConfiabilidad('segmento', equipoDe(r)?.segmento)}</small>
      </span>
      <span>{r.sistema || 'Sin dato'}</span>
      <span>{r.descripcion || 'Sin dato'}</span>
      <span>
        {r.fuente === 'sos' ? 'Muestra SOS' : etiquetaConfiabilidad('fuente', r.fuente)}
        {r.fuente === 'sos' && (r.informe_numero || r.fecha_muestra) ? ` · ${r.informe_numero || r.fecha_muestra}` : ''}
      </span>
      <span>
        {r.puntaje ?? 'Sin dato'}{' '}
        <i
          className={`dx-ui-pill ${['emergencia', 'urgente'].includes(r.prioridad_calculada) ? 'is-red' : 'is-amber'}`}
        >
          {etiquetaPrioridad(r.prioridad_calculada)}
        </i>
      </span>
      <span>{etiquetaConfiabilidad('ciclo', r.ciclo || 'nuevo')}</span>
      <span>{edad(r) == null ? 'Sin dato' : `${edad(r)} días`}</span>
      <span>{r.ot?.numero || 'Sin dato'}</span>
    </div>
  );
  const editable = !!form && (form.id ? permisos.editar : permisos.crear);
  const score = form ? puntajeBacklog(form.impacto, form.urgencia) : null;
  return (
    <section className="dx-ui dx-confbl">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">CONFIABILIDAD</div>
          <h1 className="dx-ui-title">Backlog operativo</h1>
          <p className="dx-ui-sub">Hallazgos y necesidades de mantenimiento hasta su atención en una OT.</p>
        </div>
        {permisos.crear && (
          <button className="dx-btn primary" onClick={() => abrir(null)}>
            Nuevo hallazgo
          </button>
        )}
      </header>
      <AvisoVistaConsolidada visible={permisos.vistaConsolidada} />
      {(error || permisos.error) && <p role="alert">{error || permisos.error}</p>}
      {!sesion.empresaId && (
        <div className="dx-ui-empty">{sesion.cargando ? 'Cargando sesión…' : 'Seleccione una empresa operativa.'}</div>
      )}
      {sesion.empresaId && permisos.cargando && <div className="dx-ui-empty">Cargando permisos…</div>}
      {sesion.empresaId && !permisos.cargando && !permisos.error && !permisos.ver && (
        <div className="dx-ui-empty">No tienes permiso para ver el backlog.</div>
      )}
      {permisos?.ver && (
        <>
          <div className="dx-ui-kpi-row">
            {[
              [abiertos.length, 'Abiertos'],
              [
                abiertos.filter((r) => ['emergencia', 'urgente'].includes(r.prioridad_calculada)).length,
                'Emergencias + urgentes',
              ],
              [abiertos.filter((r) => r.ciclo === 'listo_para_ot').length, 'Listos para OT'],
              [abiertos.filter((r) => r.ciclo === 'en_ot').length, 'En OT'],
              [
                edades.length ? `${(edades.reduce((a, b) => a + b, 0) / edades.length).toFixed(1)} días` : 'Sin dato',
                'Edad promedio',
              ],
              [costos, 'Costo estimado abierto'],
            ].map(([v, l]) => (
              <div className="dx-ui-kpi" key={l}>
                <strong>{v}</strong>
                <span title={l}>{l}</span>
              </div>
            ))}
          </div>
          <div className="dx-confbl-segments">
            {Object.entries(segmentos).map(([v, l]) => (
              <button
                key={v}
                className={`dx-btn dx-confbl-segment dx-confbl-${v}`}
                aria-pressed={segmento === v}
                onClick={() => setSegmento(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="dx-confbl-hint">Flota en alquiler · Máquinas de taller · Equipos de clientes</p>
          <div className="dx-ui-card">
            <div className="dx-ui-toolbar">
              <h2>Hallazgos</h2>
              <span className="dx-ui-count">
                {visibles.length} {visibles.length === 1 ? 'hallazgo' : 'hallazgos'}
              </span>
              <label className="dx-ui-search">
                <input
                  aria-label="Buscar por equipo o descripción"
                  placeholder="Buscar equipo o descripción"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <button className="dx-btn" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
                Lista
              </button>
              <button className="dx-btn" aria-pressed={vista === 'tablero'} onClick={() => setVista('tablero')}>
                Tablero
              </button>
            </div>
            <div className="dx-confbl-filters">
              {[
                [ciclo, setCiclo, ciclos, 'Ciclo', 'ciclo'],
                [prioridad, setPrioridad, prioridades, 'Prioridad', 'prioridad'],
                [fuente, setFuente, fuentes, 'Fuente', 'fuente'],
                [sistema, setSistema, sistemas, 'Sistema', 'sistema'],
              ].map(([valor, set, opciones, label, tipo]) => (
                <select
                  className="dx-ui-select"
                  key={label}
                  aria-label={label}
                  value={valor}
                  onChange={(e) => set(e.target.value)}
                >
                  <option value="">{label}: todos</option>
                  {opciones.map((o) => (
                    <option key={o} value={o}>
                      {tipo === 'prioridad' ? etiquetaPrioridad(o) : etiquetaConfiabilidad(tipo, o)}
                    </option>
                  ))}
                </select>
              ))}
            </div>
            {cargando ? (
              <div className="dx-ui-empty">Cargando hallazgos…</div>
            ) : !rows.length ? (
              <div className="dx-ui-empty">Aún no hay hallazgos registrados.</div>
            ) : !visibles.length ? (
              <div className="dx-ui-empty">No hay hallazgos que coincidan con los filtros.</div>
            ) : vista === 'lista' ? (
              <>
                <div className="dx-ui-head dx-confbl-cols">
                  <span>Equipo</span>
                  <span>Sistema</span>
                  <span>Descripción</span>
                  <span>Fuente</span>
                  <span>Prioridad</span>
                  <span>Ciclo</span>
                  <span>Edad</span>
                  <span>OT</span>
                </div>
                {visibles.map(fila)}
              </>
            ) : (
              <div className="dx-confbl-board">
                {ciclos.slice(0, 5).map((c) => (
                  <div className="dx-confbl-column" key={c}>
                    <h3>
                      {etiquetaConfiabilidad('ciclo', c)} · {visibles.filter((r) => (r.ciclo || 'nuevo') === c).length}
                    </h3>
                    {visibles
                      .filter((r) => (r.ciclo || 'nuevo') === c)
                      .map((r) => (
                        <button className="dx-confbl-board-item" key={r.id} onClick={() => abrir(r)}>
                          <b>{nombreEquipo(equipoDe(r))}</b>
                          <span>{r.descripcion || 'Sin dato'}</span>
                          <span>{etiquetaPrioridad(r.prioridad_calculada)}</span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
            {vista === 'tablero' && visibles.some((r) => ['cerrado', 'descartado'].includes(r.ciclo)) && (
              <p className="dx-confbl-hint">Los hallazgos cerrados o descartados se muestran en Lista.</p>
            )}
          </div>
        </>
      )}
      {form && (
        <div className="dx-ui-overlay">
          <form
            ref={formRef}
            className="dx-ui-dialog dx-ui-dialog-wide dx-confbl-dialog"
            onSubmit={guardar}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dx-confbl-title"
          >
            <div className="dx-ui-dialog-head">
              <div>
                <h2 id="dx-confbl-title">{form.id ? 'Hallazgo' : 'Nuevo hallazgo'}</h2>
                <p>{form.id ? etiquetaConfiabilidad('ciclo', form.ciclo || 'nuevo') : 'Registro de mantenimiento'}</p>
              </div>
              <button type="button" className="dx-btn" onClick={cerrar} aria-label="Cerrar">
                ×
              </button>
            </div>
            {editable ? (
              <div className="dx-ui-form-grid">
                <div className="dx-ui-field dx-confbl-picker">
                  <label>Equipo</label>
                  <button type="button" className="dx-btn" onClick={() => setSelector(!selector)}>
                    {nombreEquipo(equipoDe(form))}
                  </button>
                  {selector && (
                    <div className="dx-confbl-popover">
                      <input
                        aria-label="Buscar equipo"
                        value={buscarEquipo}
                        onChange={(e) => setBuscarEquipo(e.target.value)}
                        placeholder="Buscar equipo"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          patch('activo_id', '');
                          setSelector(false);
                        }}
                      >
                        Sin equipo
                      </button>
                      {activos
                        .filter((a) => normal(nombreEquipo(a)).includes(normal(buscarEquipo)))
                        .map((a) => (
                          <button
                            type="button"
                            key={a.id}
                            onClick={() => {
                              patch('activo_id', a.id);
                              setSelector(false);
                            }}
                          >
                            {nombreEquipo(a)} · {etiquetaConfiabilidad('segmento', a.segmento)}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <label className="dx-ui-field">
                  <span>Sistema</span>
                  <select
                    className="dx-ui-select"
                    value={form.sistema || ''}
                    onChange={(e) => patch('sistema', e.target.value)}
                  >
                    <option value="">Sin dato</option>
                    {sistemas.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="dx-ui-field">
                  <span>Fuente</span>
                  <select
                    className="dx-ui-select"
                    value={form.fuente || 'manual'}
                    onChange={(e) => patch('fuente', e.target.value)}
                  >
                    {fuentes.map((f) => (
                      <option key={f} value={f}>
                        {etiquetaConfiabilidad('fuente', f)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dx-ui-field dx-confbl-full">
                  <span>
                    Descripción <i className="dx-ui-required">*</i>
                  </span>
                  <textarea
                    name="descripcion"
                    aria-invalid={!!errores.descripcion}
                    value={form.descripcion || ''}
                    onChange={(e) => patch('descripcion', e.target.value)}
                  />
                  {errores.descripcion && (
                    <small className="dx-ui-field-error" role="alert">
                      {errores.descripcion}
                    </small>
                  )}
                </label>
                {['impacto', 'urgencia'].map((k) => (
                  <label className="dx-ui-field" key={k}>
                    <span>
                      {k === 'impacto' ? 'Impacto' : 'Urgencia'} <i className="dx-ui-required">*</i>
                    </span>
                    <select
                      className="dx-ui-select"
                      name={k}
                      aria-invalid={!!errores[k]}
                      value={form[k]}
                      onChange={(e) => patch(k, e.target.value)}
                    >
                      <option value="">Seleccione</option>
                      {niveles[k].map((n, i) => (
                        <option key={n} value={i + 1}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <small className="dx-ui-field-hint">
                      {k === 'impacto'
                        ? 'Consecuencia de la falla: de menor a crítica.'
                        : 'Necesidad de atención: de programable a inmediata.'}
                    </small>
                    {errores[k] && (
                      <small className="dx-ui-field-error" role="alert">
                        {errores[k]}
                      </small>
                    )}
                  </label>
                ))}
                <div className="dx-ui-field">
                  <span>Puntaje y prioridad</span>
                  <strong>
                    {score == null ? 'Sin dato' : `${score} · ${etiquetaPrioridad(prioridadBacklog(score))}`}
                  </strong>
                </div>
                <label className="dx-ui-field">
                  <span>Costo estimado</span>
                  <input
                    name="costo_estimado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costo_estimado}
                    onChange={(e) => patch('costo_estimado', e.target.value)}
                  />
                  {errores.costo_estimado && (
                    <small className="dx-ui-field-error" role="alert">
                      {errores.costo_estimado}
                    </small>
                  )}
                </label>
                <label className="dx-ui-field">
                  <span>Moneda</span>
                  <select
                    className="dx-ui-select"
                    value={form.moneda || ''}
                    onChange={(e) => patch('moneda', e.target.value)}
                  >
                    <option value="">Sin dato</option>
                    <option>PEN</option>
                    <option>USD</option>
                  </select>
                </label>
                <label className="dx-ui-field">
                  <span>Fecha de detección</span>
                  <input
                    type="date"
                    value={form.fecha_deteccion || ''}
                    onChange={(e) => patch('fecha_deteccion', e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div className="dx-ui-detail-body">
                <p>Equipo: {nombreEquipo(equipoDe(form))}</p>
                <p>Sistema: {form.sistema || 'Sin dato'}</p>
                <p>Descripción: {form.descripcion || 'Sin dato'}</p>
                <p>Fuente: {form.fuente === 'sos' ? 'Muestra SOS' : etiquetaConfiabilidad('fuente', form.fuente)}</p>
                <p>
                  Impacto: {form.impacto ?? 'Sin dato'} · Urgencia: {form.urgencia ?? 'Sin dato'} · Puntaje:{' '}
                  {form.puntaje ?? 'Sin dato'} · Prioridad: {etiquetaPrioridad(form.prioridad_calculada)}
                </p>
                <p>Costo estimado: {dinero(form.costo_estimado, form.moneda)}</p>
                <p>
                  Fecha de detección:{' '}
                  {form.fecha_deteccion ? form.fecha_deteccion.split('-').reverse().join('/') : 'Sin dato'}
                </p>
              </div>
            )}
            {form.id && (
              <div className="dx-confbl-actions">
                {editable &&
                  !['en_ot', 'cerrado', 'descartado'].includes(form.ciclo) &&
                  [
                    ['evaluado', 'Evaluar'],
                    ['pendiente_recursos', 'Pendiente de recursos'],
                    ['listo_para_ot', 'Listo para OT'],
                    ['descartado', 'Descartar'],
                  ]
                    .filter(([c]) => c !== form.ciclo)
                    .map(([c, l]) => (
                      <button
                        type="button"
                        className="dx-btn"
                        disabled={ocupado}
                        key={c}
                        onClick={() => (c === 'descartado' ? setMotivo('') : cambiar(c))}
                      >
                        {l}
                      </button>
                    ))}
                {editable && ['cerrado', 'descartado'].includes(form.ciclo) && (
                  <button type="button" className="dx-btn" onClick={() => cambiar('nuevo')}>
                    Reabrir
                  </button>
                )}
                {editable && !form.ot_id && ['evaluado', 'listo_para_ot'].includes(form.ciclo) && form.activo_id && (
                  <button type="button" className="dx-btn primary" onClick={crearOt}>
                    Crear OT
                  </button>
                )}
                {form.ot_id && (
                  <button type="button" className="dx-btn" onClick={() => onNav('ots')}>
                    Ver OT {form.ot?.numero || ''} en bandeja
                  </button>
                )}
              </div>
            )}
            {motivo !== null && (
              <div className="dx-ui-field">
                <label htmlFor="dx-confbl-motivo-descarte">
                  Motivo del descarte <i className="dx-ui-required">*</i>
                </label>
                <textarea
                  id="dx-confbl-motivo-descarte"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  aria-invalid={!!errores.motivo}
                />
                {errores.motivo && (
                  <small className="dx-ui-field-error" role="alert">
                    {errores.motivo}
                  </small>
                )}
                <div>
                  <button type="button" className="dx-btn" onClick={() => setMotivo(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="dx-btn" onClick={() => cambiar('descartado', motivo)}>
                    Confirmar descarte
                  </button>
                </div>
              </div>
            )}
            {confirmarCerrar && (
              <div role="alert">
                <p>Hay cambios sin guardar. ¿Descartarlos?</p>
                <button type="button" className="dx-btn" onClick={() => setConfirmarCerrar(false)}>
                  Seguir editando
                </button>
                <button type="button" className="dx-btn" onClick={() => setForm(null)}>
                  Descartar cambios
                </button>
              </div>
            )}
            <div className="dx-ui-dialog-foot">
              {modalError && <p role="alert">{modalError}</p>}
              <button type="button" className="dx-btn" onClick={cerrar}>
                Cerrar
              </button>
              {editable && (
                <button type="submit" className="dx-btn primary" disabled={ocupado}>
                  {ocupado ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { usePermisoPantalla } from './confiabilidadPermisos.js';
import { getSupabaseClient } from '../../../lib/supabaseClient.js';
import {
  anularFalla,
  cargarKpis,
  cerrarFalla,
  listarActivosPorSegmento,
  listarFallas,
  listarOtAbiertas,
  registrarFalla,
  vincularFallaOt,
} from '../../../services/confiabilidadService.js';
import {
  AvisoVistaConsolidada,
  BuscadorEquipo,
  Kpi,
  Periodo,
  Segmentos,
  fecha,
  numero,
  periodoInicial,
  mes,
  segmentos,
} from './confiabilidadUi.jsx';

const origenes = { ot: 'OT', parte_flota: 'Parte de flota', manual: 'Manual' };
const estados = {
  abierta: 'Abierta',
  cerrada: 'Cerrada',
  anulada: 'Anulada',
  critico: 'Crítico',
  alerta: 'Alerta',
  ok: 'OK',
  mejora: 'Mejora',
  estable: 'Estable',
  deterioro: 'Deterioro',
};
const enPeriodo = (f, p) =>
  String(f.fecha_inicio || '').slice(0, 10) <= p.hasta && (!f.fecha_fin || String(f.fecha_fin).slice(0, 10) >= p.desde);
const etiquetaActivo = (activos, id) => {
  const a = activos.find((x) => String(x.id) === String(id));
  return a ? `${a.codigo || 'Sin código'} · ${a.nombre || 'Sin nombre'}` : 'Sin dato';
};
function Grafico({ titulo, filas, campos, etiquetas }) {
  const max = Math.max(1, ...filas.flatMap((f) => campos.map((c) => Number(f[c]) || 0)));
  const ancho = Math.max(300, filas.length * 150);
  const paso = ancho / Math.max(1, filas.length);
  return (
    <div className="dx-ui-card dx-confk-chart">
      <h3>{titulo}</h3>
      {!filas.length ? (
        <div className="dx-ui-empty">No hay datos para graficar.</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${ancho} 160`} role="img" aria-label={titulo}>
            {filas.map((f, i) => (
              <g key={i}>
                {campos.map((c, j) => {
                  const n = Number(f[c]) || 0;
                  const h = (110 * n) / max;
                  return (
                    <rect
                      key={c}
                      className={j ? 'dx-confk-bar-alt' : 'dx-confk-bar'}
                      x={i * paso + 8 + j * 20}
                      y={120 - h}
                      width="16"
                      height={h}
                    >
                      <title>{`${etiquetas[j]}: ${titulo.includes('costo') && f[c] != null ? Number(f[c]).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : numero(f[c])}`}</title>
                    </rect>
                  );
                })}
                <text x={i * paso + 5} y="140">
                  <title>{f.mes ? mes(f.mes) : f.sistema || f.nombre || 'Sin dato'}</title>
                  {f.mes ? mes(f.mes) : f.sistema || f.nombre || 'Sin dato'}
                </text>
              </g>
            ))}
          </svg>
          <p>{etiquetas.join(' · ')}</p>
          <ul>
            {filas.map((f, i) => (
              <li key={i}>
                {f.mes ? mes(f.mes) : f.sistema || f.nombre || 'Sin dato'}:{' '}
                {campos
                  .map(
                    (c, j) =>
                      `${etiquetas[j]} ${titulo.includes('costo') && f[c] != null ? Number(f[c]).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : numero(f[c], c === 'porcentaje_acumulado' || c === 'disponibilidad_pct' ? '%' : '')}`,
                  )
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
function ModalFalla({ tipo, falla, activos, empresaId, sociedadId, onClose, onSaved }) {
  const [form, setForm] = useState({
    activo: falla?.activo_id || '',
    inicio: '',
    fin: '',
    sistema: '',
    modo: '',
    descripcion: '',
    ot: falla?.ot_id || '',
    motivo: '',
  });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [ots, setOts] = useState([]);
  const [errorOt, setErrorOt] = useState('');
  const ref = useRef(null);
  const dirty = Object.entries(form).some(
    ([k, v]) => v && !((k === 'activo' && v === falla?.activo_id) || (k === 'ot' && v === falla?.ot_id)),
  );
  useEffect(() => {
    if (tipo !== 'vincular') return;
    let activo = true;
    let q = getSupabaseClient()
      .from('ordenes_trabajo')
      .select('id,numero,equipo_id,estado,created_at')
      .eq('empresa_id', empresaId)
      .eq('equipo_id', falla.activo_id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (sociedadId) q = q.eq('sociedad_id', sociedadId);
    Promise.all([q, listarOtAbiertas(empresaId, sociedadId)])
      .then(([{ data, error: e }, abiertas]) => {
        if (e) throw e;
        if (activo)
          setOts([
            ...new Map(
              [...(data || []), ...abiertas.filter((o) => String(o.equipo_id) === String(falla.activo_id))].map((o) => [
                o.id,
                o,
              ]),
            ).values(),
          ]);
      })
      .catch((e) => {
        if (activo) setErrorOt(e.message);
      });
    return () => {
      activo = false;
    };
  }, [tipo, empresaId, sociedadId, falla]);
  const cambio = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const cerrar = () => (dirty ? setConfirmar(true) : onClose());
  const guardar = async (e) => {
    e.preventDefault();
    const err = {};
    if (tipo === 'registrar') {
      if (!form.activo) err.activo = 'Selecciona un equipo.';
      if (!form.inicio) err.inicio = 'Indica el inicio.';
      if (!form.descripcion.trim()) err.descripcion = 'Indica la descripción.';
    }
    if (tipo === 'cerrar' && !form.fin) err.fin = 'Indica el fin.';
    if (tipo === 'anular' && !form.motivo.trim()) err.motivo = 'Indica el motivo.';
    if (
      form.fin &&
      ((form.inicio && form.fin < form.inicio) ||
        (tipo === 'cerrar' && new Date(form.fin) < new Date(falla.fecha_inicio)))
    )
      err.fin = 'El fin no puede ser anterior al inicio.';
    setErrores(err);
    if (Object.keys(err).length) {
      requestAnimationFrame(() => ref.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (tipo === 'registrar')
        await registrarFalla(
          empresaId,
          form.activo,
          new Date(form.inicio).toISOString(),
          form.fin ? new Date(form.fin).toISOString() : null,
          form.sistema || null,
          form.modo || null,
          form.descripcion.trim(),
        );
      if (tipo === 'cerrar') await cerrarFalla(falla.id, new Date(form.fin).toISOString());
      if (tipo === 'vincular') await vincularFallaOt(falla.id, form.ot);
      if (tipo === 'anular') await anularFalla(falla.id, form.motivo.trim());
      onSaved();
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };
  const campo = (id, label, type = 'text', required = false) => (
    <label className="dx-ui-field">
      <span>
        {label} {required && <b className="dx-ui-required">*</b>}
      </span>
      <input type={type} value={form[id]} aria-invalid={!!errores[id]} onChange={(e) => cambio(id, e.target.value)} />
      {errores[id] && (
        <span className="dx-ui-field-error" role="alert">
          {errores[id]}
        </span>
      )}
    </label>
  );
  const titulo = {
    registrar: 'Registrar falla',
    cerrar: 'Cerrar falla',
    vincular: 'Vincular a OT',
    anular: 'Anular falla',
  }[tipo];
  return (
    <div className="dx-ui-overlay">
      <div className="dx-ui-dialog dx-ui-dialog-wide" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <div className="dx-ui-dialog-head">
          <h2>{titulo}</h2>
          <button type="button" className="dx-btn" onClick={cerrar} aria-label="Cerrar diálogo">
            ×
          </button>
        </div>
        <form onSubmit={guardar}>
          <div className="dx-ui-form-grid">
            {tipo === 'registrar' && (
              <>
                <label className="dx-ui-field">
                  <span>
                    Equipo <b className="dx-ui-required">*</b>
                  </span>
                  <BuscadorEquipo
                    activos={activos}
                    value={form.activo}
                    onChange={(v) => cambio('activo', v)}
                    invalid={!!errores.activo}
                  />
                  {errores.activo && (
                    <span className="dx-ui-field-error" role="alert">
                      {errores.activo}
                    </span>
                  )}
                </label>
                {campo('inicio', 'Inicio', 'datetime-local', true)}
                {campo('fin', 'Fin', 'datetime-local')}
                {campo('sistema', 'Sistema')}
                {campo('modo', 'Modo de falla')}
                <label className="dx-ui-field">
                  <span>
                    Descripción <b className="dx-ui-required">*</b>
                  </span>
                  <textarea
                    value={form.descripcion}
                    aria-invalid={!!errores.descripcion}
                    onChange={(e) => cambio('descripcion', e.target.value)}
                  />
                  {errores.descripcion && (
                    <span className="dx-ui-field-error" role="alert">
                      {errores.descripcion}
                    </span>
                  )}
                </label>
              </>
            )}
            {tipo === 'cerrar' && campo('fin', 'Fecha y hora de fin', 'datetime-local', true)}
            {tipo === 'anular' && campo('motivo', 'Motivo de anulación', 'text', true)}
            {tipo === 'vincular' && (
              <label className="dx-ui-field">
                <span>Orden de trabajo del equipo</span>
                <select className="dx-ui-select" value={form.ot} onChange={(e) => cambio('ot', e.target.value)}>
                  <option value="">Sin OT vinculada</option>
                  {ots.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero || 'Sin número'} · {o.estado}
                    </option>
                  ))}
                </select>
                <span className="dx-ui-field-hint">
                  Vincular agrupa la falla con la OT para evitar contarla doble. Se muestran las 100 órdenes más
                  recientes del equipo.
                </span>
                {errorOt && <span role="alert">No se pudieron cargar las OT: {errorOt}</span>}
              </label>
            )}
          </div>
          <div className="dx-ui-dialog-foot">
            {error && <span role="alert">{error}</span>}
            {confirmar ? (
              <>
                <span>Hay cambios sin guardar. ¿Descartarlos?</span>
                <button type="button" className="dx-btn" onClick={() => setConfirmar(false)}>
                  Seguir editando
                </button>
                <button type="button" className="dx-btn" onClick={onClose}>
                  Descartar
                </button>
              </>
            ) : (
              <>
                <button type="button" className="dx-btn" onClick={cerrar}>
                  Cancelar
                </button>
                <button type="submit" className="dx-btn primary" disabled={busy || !!errorOt}>
                  {busy ? 'Guardando…' : titulo}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export function KpisConfiabilidadPage({ onNav }) {
  const { empresaId, sociedadId, estado } = useSesionOperativa();
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [segmento, setSegmento] = useState('todos');
  const [tab, setTab] = useState('resumen');
  const [datos, setDatos] = useState(null);
  const [fallas, setFallas] = useState([]);
  const [activos, setActivos] = useState([]);
  const acceso = usePermisoPantalla('confiabilidad_kpis');
  const acciones = usePermisoPantalla('backlog');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('fallas');
  const [detalle, setDetalle] = useState(null);
  const [modal, setModal] = useState(null);
  useEffect(() => {
    let vigente = true;
    if (!empresaId || acceso.cargando || !acceso.ver) {
      setCargando(false);
      return () => {
        vigente = false;
      };
    }
    setCargando(true);
    setError('');
    setDatos(null);
    Promise.all([
      periodo.desde && periodo.hasta && periodo.desde <= periodo.hasta
        ? cargarKpis(empresaId, sociedadId, periodo.desde, periodo.hasta, segmento)
        : Promise.reject(new Error('Selecciona un periodo válido.')),
      listarFallas(empresaId, sociedadId),
      listarActivosPorSegmento(empresaId),
    ])
      .then(([k, f, a]) => {
        if (vigente) {
          setDatos(k || {});
          setFallas(f);
          setActivos(a);
        }
      })
      .catch((e) => {
        if (vigente) setError(e.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [empresaId, sociedadId, periodo.desde, periodo.hasta, segmento, version, acceso.cargando, acceso.ver]);
  const fallasPeriodo = useMemo(
    () =>
      fallas.filter(
        (f) =>
          enPeriodo(f, periodo) &&
          (segmento === 'todos' ||
            activos.some((a) => String(a.id) === String(f.activo_id) && a.segmento === segmento)),
      ),
    [fallas, activos, periodo, segmento],
  );
  const equipos = useMemo(
    () =>
      (datos?.por_equipo || [])
        .filter((x) => `${x.codigo || ''} ${x.nombre || ''}`.toLowerCase().includes(busqueda.toLowerCase()))
        .slice()
        .sort((a, b) =>
          orden === 'nombre'
            ? String(a.nombre || '').localeCompare(String(b.nombre || ''))
            : Number(b[orden] || 0) - Number(a[orden] || 0),
        ),
    [datos, busqueda, orden],
  );
  const g = datos?.globales || {};
  const ant = datos?.periodo_anterior || {};
  const kpis =
    segmento === 'cliente'
      ? [
          ['Días entre fallas', 'dias_entre_fallas'],
          ['MTTR (h)', 'mttr_horas', true],
          ['Fallas', 'fallas', true],
          ['Ratio de mantenimiento', 'ratio_mantenimiento'],
          ['Cumplimiento PM %', 'cumplimiento_pm_pct'],
        ]
      : [
          ['MTBF (h)', 'mtbf_horas'],
          ['MTTR (h)', 'mttr_horas', true],
          ['Disponibilidad %', 'disponibilidad_pct'],
          ['Fallas', 'fallas', true],
          ['Ratio de mantenimiento', 'ratio_mantenimiento'],
          ['Cumplimiento PM %', 'cumplimiento_pm_pct'],
        ];
  const calidad = [
    ['ot_correctivas_sin_equipo', 'OT correctivas sin equipo', 'No cuentan en MTBF; asígnales equipo.'],
    ['ot_pm_sin_equipo', 'OT preventivas sin equipo', 'Asígnales equipo para incluirlas en el análisis.'],
    ['activos_sin_horometro', 'Activos sin horómetro', 'Registra una lectura para medir sus horas de operación.'],
    ['maquinas_taller_sin_activo', 'Máquinas de taller sin activo', 'Vincúlalas en el Configurador del Planner.'],
  ];
  const listaFallas = (lista) =>
    !lista.length ? (
      <div className="dx-ui-empty">No hay fallas para este periodo y segmento.</div>
    ) : (
      <div className="dx-confk-table-wrap">
        <table className="dx-confk-table">
          <thead>
            <tr>
              {[
                'Origen',
                'Equipo',
                'Sistema / modo',
                'Inicio / fin',
                'Parada',
                'Estado',
                'OT vinculada',
                'Acciones',
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.id}>
                <td>{origenes[f.origen] || 'Sin dato'}</td>
                <td>{etiquetaActivo(activos, f.activo_id)}</td>
                <td>
                  {f.sistema || 'Sin dato'} / {f.modo_falla || 'Sin dato'}
                </td>
                <td>
                  {fecha(f.fecha_inicio)}
                  <br />
                  {fecha(f.fecha_fin)}
                </td>
                <td>{numero(f.horas_parada, ' h')}</td>
                <td>{estados[f.estado] || 'Sin dato'}</td>
                <td>{f.ot?.numero || f.ot_numero || 'Sin dato'}</td>
                <td>
                  {acciones.editar && f.estado !== 'anulada' && (
                    <>
                      {f.estado === 'abierta' && (
                        <button className="dx-btn" onClick={() => setModal({ tipo: 'cerrar', falla: f })}>
                          Cerrar
                        </button>
                      )}
                      {f.origen !== 'ot' && (
                        <button className="dx-btn" onClick={() => setModal({ tipo: 'vincular', falla: f })}>
                          Vincular a OT
                        </button>
                      )}
                      <button className="dx-btn" onClick={() => setModal({ tipo: 'anular', falla: f })}>
                        Anular
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <section className="dx-ui dx-confk">
      <header>
        <div className="dx-ui-eyebrow">CONFIABILIDAD</div>
        <h1 className="dx-ui-title">KPIs de confiabilidad</h1>
        <p>Fallas, mantenimiento y disponibilidad por segmento.</p>
      </header>
      <AvisoVistaConsolidada visible={acciones.vistaConsolidada} />
      <div className="dx-ui-card dx-confk-filtros">
        <Periodo value={periodo} onChange={setPeriodo} />
        <Segmentos prefijo="dx-confk" value={segmento} onChange={setSegmento} />
      </div>
      {cargando || acceso.cargando || acciones.cargando || estado === 'cargando' ? (
        <div className="dx-ui-empty">Cargando indicadores y fallas…</div>
      ) : error || acceso.error || acciones.error ? (
        <div className="dx-ui-empty" role="alert">
          {error || acceso.error || acciones.error}
        </div>
      ) : !empresaId ? (
        <div className="dx-ui-empty">No hay una empresa disponible en la sesión.</div>
      ) : !acceso?.ver ? (
        <div className="dx-ui-empty">No tienes permiso para ver los KPIs de confiabilidad.</div>
      ) : (
        <>
          <nav className="dx-ui-tabs dx-confk-tabs" aria-label="Secciones de confiabilidad">
            {[
              ['resumen', 'Resumen'],
              ['equipos', 'Por equipo'],
              ['fallas', 'Registro de fallas'],
              ['calidad', 'Calidad de datos'],
            ].map(([id, nombre]) => (
              <button
                key={id}
                className={`dx-ui-tab${tab === id ? ' on' : ''}`}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {nombre}
              </button>
            ))}
          </nav>
          {tab === 'resumen' && (
            <>
              <div className="dx-ui-kpi-row">
                {kpis.map(([titulo, clave, menor]) => (
                  <Kpi key={clave} titulo={titulo} valor={g[clave]} anterior={ant[clave]} menorEsMejor={menor} />
                ))}
              </div>
              {segmento === 'cliente' && (
                <p>
                  Para equipos de clientes se usan días entre fallas: no se dispone de horas operadas ni de
                  disponibilidad contractual propias.
                </p>
              )}
              <div className="dx-confk-charts">
                <Grafico
                  titulo="Serie mensual: fallas y disponibilidad"
                  filas={datos?.serie_mensual || []}
                  campos={segmento === 'cliente' ? ['fallas'] : ['fallas', 'disponibilidad_pct']}
                  etiquetas={segmento === 'cliente' ? ['Fallas'] : ['Fallas', 'Disponibilidad %']}
                />
                <Grafico
                  titulo="Pareto de fallas por sistema"
                  filas={datos?.pareto_sistemas || []}
                  campos={['fallas', 'porcentaje_acumulado']}
                  etiquetas={['Fallas', 'Acumulado %']}
                />
                <Grafico
                  titulo="PM vs correctivo: cantidad"
                  filas={[{ nombre: 'Órdenes', pm: g.ot_preventivas, correctivo: g.ot_correctivas }]}
                  campos={['pm', 'correctivo']}
                  etiquetas={['PM', 'Correctivo']}
                />
                <Grafico
                  titulo="PM vs correctivo: costo"
                  filas={[{ nombre: 'Costo', pm: g.costo_preventivo, correctivo: g.costo_correctivo }]}
                  campos={['pm', 'correctivo']}
                  etiquetas={['PM', 'Correctivo']}
                />
              </div>
              <p>Suma de costos reales de OT; puede incluir distintas monedas.</p>
              <div className="dx-ui-card dx-confk-explicacion">
                <h2>Cómo se calculan los indicadores</h2>
                <p>
                  MTBF: horas operadas divididas entre fallas. MTTR: horas de parada divididas entre fallas.
                  Disponibilidad: horas disponibles divididas entre horas posibles. Fallas: eventos agrupados por OT
                  cuando están vinculados.
                </p>
                <p>
                  Ratio de mantenimiento: costo preventivo dividido entre costo total de mantenimiento. Cumplimiento PM:
                  preventivos cerrados dentro del plazo dividido entre preventivos programados. Días entre fallas:
                  promedio de días transcurridos entre fallas consecutivas del equipo.
                </p>
              </div>
            </>
          )}
          {tab === 'equipos' && (
            <div className="dx-ui-card">
              <div className="dx-ui-toolbar">
                <h2>Por equipo</h2>
                <span className="dx-ui-count">
                  {equipos.length} {equipos.length === 1 ? 'equipo' : 'equipos'}
                </span>
                <label className="dx-ui-search">
                  <input
                    aria-label="Buscar equipos"
                    placeholder="Buscar equipo"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </label>
                <label>
                  Ordenar{' '}
                  <select className="dx-ui-select" value={orden} onChange={(e) => setOrden(e.target.value)}>
                    <option value="fallas">Más fallas</option>
                    <option value="nombre">Nombre</option>
                    <option value="mttr_horas">Mayor MTTR</option>
                  </select>
                </label>
              </div>
              {!equipos.length ? (
                <div className="dx-ui-empty">
                  {busqueda ? 'No hay equipos que coincidan con la búsqueda.' : 'No hay equipos para este periodo.'}
                </div>
              ) : (
                <div className="dx-confk-table-wrap">
                  <table className="dx-confk-table">
                    <thead>
                      <tr>
                        {['Equipo', 'Segmento', 'Fallas', 'MTBF', 'MTTR', 'Disponibilidad', 'Estado', 'Tendencia'].map(
                          (x) => (
                            <th key={x}>{x}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {equipos.map((x) => (
                        <tr
                          key={x.activo_id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetalle(x)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setDetalle(x);
                            }
                          }}
                        >
                          <td>
                            {x.codigo || 'Sin dato'} · {x.nombre || 'Sin dato'}
                          </td>
                          <td>
                            <span className={`dx-confk-segment dx-confk-segment-${x.segmento}`}>
                              {segmentos[x.segmento] || 'Otro'}
                            </span>
                          </td>
                          <td>{numero(x.fallas)}</td>
                          <td>{numero(x.mtbf_horas, ' h')}</td>
                          <td>{numero(x.mttr_horas, ' h')}</td>
                          <td>{numero(x.disponibilidad_pct, '%')}</td>
                          <td>{estados[x.estado] || 'Sin dato'}</td>
                          <td>{estados[x.tendencia] || 'Sin dato'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === 'fallas' && (
            <div className="dx-ui-card">
              <div className="dx-ui-toolbar">
                <h2>Registro de fallas</h2>
                <span className="dx-ui-count">
                  {fallasPeriodo.length} {fallasPeriodo.length === 1 ? 'falla' : 'fallas'}
                </span>
                {acciones.crear && (
                  <button className="dx-btn primary" onClick={() => setModal({ tipo: 'registrar' })}>
                    Registrar falla
                  </button>
                )}
              </div>
              <p>Usa este registro para paradas de tornos, CNC y demás máquinas del taller.</p>
              {listaFallas(fallasPeriodo)}
            </div>
          )}
          {tab === 'calidad' && (
            <div className="dx-confk-calidad">
              {calidad.map(([clave, titulo, ayuda]) => (
                <div className="dx-ui-card" key={clave}>
                  <h2>{titulo}</h2>
                  <strong>{numero(datos?.calidad_datos?.[clave])}</strong>
                  <p>{ayuda}</p>
                </div>
              ))}
            </div>
          )}
          {detalle && (
            <div className="dx-ui-overlay">
              <aside
                className="dx-ui-dialog dx-ui-dialog-wide dx-confk-detalle"
                role="dialog"
                aria-modal="true"
                aria-label="Detalle del equipo"
              >
                <div className="dx-ui-dialog-head">
                  <h2>
                    {detalle.codigo} · {detalle.nombre}
                  </h2>
                  <button className="dx-btn" aria-label="Cerrar detalle" onClick={() => setDetalle(null)}>
                    ×
                  </button>
                </div>
                <p>Fallas del periodo</p>
                {listaFallas(fallasPeriodo.filter((f) => String(f.activo_id) === String(detalle.activo_id)))}
              </aside>
            </div>
          )}
          {modal && (
            <ModalFalla
              {...modal}
              activos={activos}
              empresaId={empresaId}
              sociedadId={sociedadId}
              onClose={() => setModal(null)}
              onSaved={() => {
                setModal(null);
                setVersion((v) => v + 1);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { getSupabaseClient } from '../../../lib/supabaseClient.js';
import {
  listarActivosPorSegmento,
  listarMuestrasSos,
  limitesSosVigentes,
  guardarMuestraSos,
  guardarResultadosSos,
  marcarMuestraRevisada,
  guardarLimiteSos,
  subirInformeSos,
  urlInformeSos,
  guardarBacklog,
  listarBacklog,
} from '../../../services/confiabilidadService.js';
import { nivelSos, condicionSos, etiquetaConfiabilidad } from './confiabilidadLogic.js';

const fecha = (x) => (x ? x.slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const valor = (x) => (x == null || x === '' ? 'Sin dato' : x);
const etiquetas = {
  normal: 'Normal',
  alerta: 'Alerta',
  critico: 'Crítico',
  registrada: 'Pendiente de resultado',
  con_resultado: 'Sin revisar',
  revisada: 'Revisada',
  anulada: 'Anulada',
};
const color = { normal: 'green', alerta: 'amber', critico: 'red' };
const normalizar = (x) =>
  String(x || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
const alias = {
  hierro: 'Fe',
  cobre: 'Cu',
  aluminio: 'Al',
  cromo: 'Cr',
  plomo: 'Pb',
  silicio: 'Si',
  sodio: 'Na',
  potasio: 'K',
  viscosity: 'viscosidad',
  water: 'agua',
  soot: 'hollín',
};
async function acceso(empresa, pantalla) {
  const db = getSupabaseClient();
  return Object.fromEntries(
    await Promise.all(
      ['ver', 'crear', 'editar'].map(async (accion) => {
        const { data, error } = await db.rpc('usuario_puede', {
          target_empresa_id: empresa,
          target_pantalla: pantalla,
          target_accion: accion,
        });
        return [accion, !error && !!data];
      }),
    ),
  );
}
function Campo({ nombre, etiqueta, form, setForm, errores, tipo = 'text', requerido, children }) {
  return (
    <label className="dx-ui-field">
      <span>
        {etiqueta} {requerido && <b className="dx-ui-required">*</b>}
      </span>
      {children || (
        <input
          name={nombre}
          type={tipo}
          value={form[nombre] ?? ''}
          aria-invalid={!!errores[nombre]}
          onChange={(e) => setForm({ ...form, [nombre]: e.target.value })}
        />
      )}
      {errores[nombre] && (
        <span className="dx-ui-field-error" role="alert">
          {errores[nombre]}
        </span>
      )}
    </label>
  );
}
const limiteTexto = (l) =>
  l.tipo === 'rango'
    ? `Normal ${l.minimo}–${l.maximo}; alerta ±${l.alerta} %, crítico ±${l.critico} %`
    : `Alerta ${l.alerta}, crítico ${l.critico} ${l.unidad}`;
export function AnalisisSosPage({ onNav }) {
  const sesion = useSesionOperativa(),
    empresa = sesion.empresaId || sesion.empresa?.id,
    sociedad = sesion.sociedadId || sesion.sociedad?.id || null;
  const [perm, setPerm] = useState(null),
    [permBacklog, setPermBacklog] = useState(null),
    [muestras, setMuestras] = useState([]),
    [activos, setActivos] = useState([]),
    [backlogs, setBacklogs] = useState([]),
    [limites, setLimites] = useState([]),
    [todosLimites, setTodosLimites] = useState([]);
  const [cargando, setCargando] = useState(true),
    [error, setError] = useState(''),
    [aviso, setAviso] = useState(''),
    [resultadoGuardado, setResultadoGuardado] = useState(null);
  const [tab, setTab] = useState('muestras'),
    [busqueda, setBusqueda] = useState(''),
    [condicion, setCondicion] = useState('todos'),
    [estado, setEstado] = useState('todos'),
    [segmento, setSegmento] = useState('todos'),
    [sistema, setSistema] = useState('todos');
  const [modal, setModal] = useState(''),
    [seleccion, setSeleccion] = useState(null),
    [form, setForm] = useState({}),
    [errores, setErrores] = useState({}),
    [valores, setValores] = useState({}),
    [archivo, setArchivo] = useState(null),
    [preview, setPreview] = useState([]),
    [sucio, setSucio] = useState(false),
    [confirmar, setConfirmar] = useState(false);
  async function cargar() {
    if (!empresa) return;
    setCargando(true);
    setError('');
    try {
      const [p, pb] = await Promise.all([acceso(empresa, 'analisis_sos'), acceso(empresa, 'backlog')]);
      setPerm(p);
      setPermBacklog(pb);
      if (p.ver) {
        const [m, a, l, b] = await Promise.all([
          listarMuestrasSos(empresa, sociedad),
          listarActivosPorSegmento(empresa),
          getSupabaseClient()
            .from('conf_sos_limites')
            .select('*')
            .or(`empresa_id.is.null,empresa_id.eq.${empresa}`)
            .order('elemento'),
          pb.ver ? listarBacklog(empresa, sociedad) : Promise.resolve([]),
        ]);
        if (l.error) throw l.error;
        setMuestras(m);
        setActivos(a);
        setTodosLimites(l.data || []);
        setBacklogs(b);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
  }, [empresa, sociedad]);
  function abrir(tipo, f = {}, m = null) {
    setModal(tipo);
    setForm(f);
    setSeleccion(m);
    setErrores({});
    setError('');
    setSucio(false);
    setConfirmar(false);
    setArchivo(null);
    setPreview([]);
  }
  function cerrar() {
    if (sucio) setConfirmar(true);
    else setModal('');
  }
  async function resultados(m) {
    abrir('resultados', { fecha_resultado: m.fecha_resultado || '', recomendacion: m.recomendacion || '' }, m);
    setLimites([]);
    setValores(Object.fromEntries((m.resultados || []).map((r) => [r.elemento, r.valor])));
    try {
      setLimites(await limitesSosVigentes(empresa, m.sistema));
    } catch (e) {
      setError(e.message);
    }
  }
  async function detalle(m) {
    abrir('detalle', {}, m);
    setLimites([]);
    try {
      setLimites(await limitesSosVigentes(empresa, m.sistema));
    } catch (e) {
      setError(e.message);
    }
  }
  async function importar(f) {
    try {
      const libro = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' });
      const items = rows.map((row) => {
        const keys = Object.keys(row);
        const ek = keys.find((k) => ['elemento', 'element', 'metal'].includes(normalizar(k))),
          vk = keys.find((k) => ['valor', 'value', 'resultado', 'result'].includes(normalizar(k)));
        const nombre = row[ek] || '',
          buscado = alias[normalizar(nombre)] || nombre;
        const limite = limites.find((l) => normalizar(l.elemento) === normalizar(buscado));
        return {
          nombre,
          elemento: limite?.elemento,
          valor: row[vk],
          valido: !!limite && row[vk] !== '' && Number.isFinite(Number(row[vk])) && Number(row[vk]) >= 0,
        };
      });
      setPreview(items);
      setSucio(true);
      if (!items.length) setError('El archivo no contiene filas. Usa columnas elemento y valor.');
      else setError('');
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`);
    }
  }
  async function guardar(e) {
    e.preventDefault();
    const err = {};
    if (modal === 'muestra') {
      if (!activos.some((a) => a.id === form.activo_id)) err.activo_id = 'Elige un equipo de la lista.';
      if (!form.sistema?.trim()) err.sistema = 'Indica el sistema.';
      if (!form.fecha_muestra) err.fecha_muestra = 'Indica la fecha.';
      for (const k of ['horometro_muestra', 'horas_aceite'])
        if (form[k] !== '' && form[k] != null && Number(form[k]) < 0) err[k] = 'No puede ser negativo.';
    }
    if (modal === 'resultados') {
      if (!form.fecha_resultado) err.fecha_resultado = 'Indica la fecha.';
      const entries = limites.map((l) => valores[l.elemento]).filter((v) => v !== '' && v != null);
      if (!entries.length || entries.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0))
        err.valores = 'Ingresa al menos un valor válido y no negativo con límite vigente.';
      if (archivo && archivo.type !== 'application/pdf') err.informe = 'Selecciona un PDF.';
    }
    if (modal === 'limite') {
      for (const k of ['elemento', 'unidad', 'alerta', 'critico'])
        if (form[k] === '' || form[k] == null) err[k] = 'Campo obligatorio.';
      if (Number(form.alerta) < 0 || Number(form.critico) <= Number(form.alerta))
        err.critico = 'Debe superar el umbral de alerta.';
      if (
        form.tipo === 'rango' &&
        (form.minimo === '' ||
          form.maximo === '' ||
          Number(form.minimo) >= Number(form.maximo) ||
          Number(form.alerta) <= 0)
      )
        err.minimo = 'Indica un rango válido y alerta mayor que cero.';
    }
    setErrores(err);
    if (Object.keys(err).length) {
      setTimeout(
        () =>
          (document.querySelector('.ops-zahory-host')?.shadowRoot || document)
            .querySelector(`[name="${Object.keys(err)[0]}"]`)
            ?.focus(),
        0,
      );
      return;
    }
    try {
      setError('');
      if (modal === 'muestra') {
        await guardarMuestraSos({ ...form, empresa_id: empresa, sociedad_id: sociedad });
        setAviso('Muestra registrada.');
      } else if (modal === 'limite') {
        await guardarLimiteSos({ ...form, empresa_id: empresa });
        setAviso('Límite guardado.');
      } else {
        let path = seleccion.informe_path || null;
        if (archivo) path = await subirInformeSos(empresa, seleccion.id, archivo);
        const rows = limites
          .filter((l) => valores[l.elemento] !== '' && valores[l.elemento] != null)
          .map((l) => ({ elemento: l.elemento, valor: Number(valores[l.elemento]), unidad: l.unidad }));
        const res = await guardarResultadosSos(
          seleccion.id,
          rows,
          form.recomendacion || null,
          form.fecha_resultado,
          path,
        );
        setResultadoGuardado(res);
        setAviso(`Condición resultante: ${etiquetas[res.condicion]}.`);
      }
      setSucio(false);
      setModal('');
      await cargar();
    } catch (ex) {
      setError(ex.message);
    }
  }
  async function crearBacklog(m) {
    try {
      const id = await guardarBacklog({
        empresa_id: empresa,
        sociedad_id: m.sociedad_id,
        activo_id: m.activo_id,
        sistema: m.sistema,
        fuente: 'sos',
        fuente_id: m.id,
        descripcion: `Alerta SOS: ${m.sistema}${m.recomendacion ? ` · ${m.recomendacion}` : ''}`,
        impacto: 3,
        urgencia: 3,
        fecha_deteccion: m.fecha_muestra,
      });
      setAviso(`Backlog ${id} creado.`);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }
  const activo = (id) => activos.find((a) => a.id === id),
    backlog = (m) => m.backlog_id || backlogs.find((b) => b.fuente === 'sos' && b.fuente_id === m.id)?.id;
  const visibles = muestras.filter(
    (m) =>
      (condicion === 'todos' || m.condicion === condicion) &&
      (estado === 'todos' || m.estado === estado) &&
      (segmento === 'todos' || activo(m.activo_id)?.segmento === segmento) &&
      (sistema === 'todos' || m.sistema === sistema) &&
      `${activo(m.activo_id)?.codigo || ''} ${activo(m.activo_id)?.nombre || ''} ${m.sistema} ${m.laboratorio || ''} ${m.numero_informe || ''}`
        .toLowerCase()
        .includes(busqueda.toLowerCase()),
  );
  const mes = new Date().toISOString().slice(0, 7),
    periodo = muestras.filter((m) => m.fecha_muestra?.startsWith(mes));
  if (!empresa && sesion.estado !== 'cargando')
    return (
      <section className="dx-ui">
        <div className="dx-ui-empty">{sesion.error || 'Selecciona una empresa para consultar las muestras.'}</div>
      </section>
    );
  if (!empresa || cargando)
    return (
      <section className="dx-ui">
        <div className="dx-ui-empty">Cargando análisis SOS…</div>
      </section>
    );
  if (!perm?.ver)
    return (
      <section className="dx-ui">
        <div className="dx-ui-empty">{error || 'No tienes permiso para ver análisis SOS.'}</div>
      </section>
    );
  return (
    <section className="dx-ui dx-confsos-root">
      <header>
        <small>CONFIABILIDAD</small>
        <h1>Análisis de aceite (SOS)</h1>
        <p>SOS significa Scheduled Oil Sampling: análisis de aceite programado para detectar desgaste.</p>
      </header>
      <div className="dx-ui-kpi-row">
        {[
          ['Muestras del mes', periodo.length],
          ['Críticas', periodo.filter((m) => m.condicion === 'critico').length],
          ['En alerta', periodo.filter((m) => m.condicion === 'alerta').length],
          ['Pendientes de resultado', periodo.filter((m) => m.estado === 'registrada').length],
          ['Sin revisar', periodo.filter((m) => m.estado === 'con_resultado').length],
        ].map(([l, n]) => (
          <div className="dx-ui-kpi" key={l}>
            <strong>{n}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
      {aviso && (
        <p role="status">
          {aviso}{' '}
          {resultadoGuardado?.backlog_id && (
            <button onClick={() => onNav?.('backlog')}>Ver backlog {resultadoGuardado.backlog_id}</button>
          )}
        </p>
      )}
      {error && !modal && <p role="alert">{error}</p>}
      <nav>
        <button onClick={() => setTab('muestras')}>Muestras</button>
        <button onClick={() => setTab('limites')}>Límites</button>
      </nav>
      <div className="dx-ui-card dx-confsos-card">
        <div className="dx-ui-toolbar">
          <h2>{tab === 'muestras' ? 'Muestras' : 'Límites globales y de la empresa'}</h2>
          <span className="dx-ui-count">{tab === 'muestras' ? visibles.length : todosLimites.length} registros</span>
          {tab === 'muestras' && perm.crear && (
            <button
              onClick={() =>
                abrir('muestra', {
                  activo_id: '',
                  sistema: '',
                  tipo_aceite: '',
                  horometro_muestra: '',
                  horas_aceite: '',
                  fecha_muestra: '',
                  laboratorio: '',
                  numero_informe: '',
                })
              }
            >
              Nueva muestra
            </button>
          )}
          {tab === 'limites' && perm.editar && (
            <button
              onClick={() =>
                abrir('limite', {
                  sistema: '',
                  elemento: '',
                  unidad: '',
                  tipo: 'max',
                  alerta: '',
                  critico: '',
                  minimo: '',
                  maximo: '',
                })
              }
            >
              Nuevo límite propio
            </button>
          )}
        </div>
        {tab === 'muestras' ? (
          <>
            <div className="dx-confsos-filtros">
              <input
                aria-label="Buscar muestras"
                placeholder="Buscar muestras"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <select aria-label="Condición" value={condicion} onChange={(e) => setCondicion(e.target.value)}>
                <option value="todos">Todas las condiciones</option>
                {['normal', 'alerta', 'critico'].map((x) => (
                  <option key={x} value={x}>
                    {etiquetas[x]}
                  </option>
                ))}
              </select>
              <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="todos">Todos los estados</option>
                {['registrada', 'con_resultado', 'revisada', 'anulada'].map((x) => (
                  <option key={x} value={x}>
                    {etiquetas[x]}
                  </option>
                ))}
              </select>
              <select aria-label="Segmento" value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="flota">Flota en alquiler</option>
                <option value="taller">Máquinas de taller</option>
                <option value="cliente">Equipos de clientes</option>
              </select>
              <select aria-label="Sistema" value={sistema} onChange={(e) => setSistema(e.target.value)}>
                <option value="todos">Todos los sistemas</option>
                {[...new Set(muestras.map((m) => m.sistema))].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <p>Flota: equipos en alquiler · Taller: máquinas propias · Cliente: equipos de terceros.</p>
            {!visibles.length && (
              <div className="dx-ui-empty">
                {muestras.length ? 'No hay muestras que coincidan con los filtros.' : 'No hay muestras registradas.'}
              </div>
            )}
            {visibles.map((m) => (
              <article className="dx-confsos-fila" key={m.id}>
                <div>
                  <strong>
                    {valor(activo(m.activo_id)?.codigo)} · {valor(activo(m.activo_id)?.nombre)}
                  </strong>
                  <p>
                    {etiquetaConfiabilidad('segmento', activo(m.activo_id)?.segmento)} · {m.sistema}
                  </p>
                </div>
                <div>
                  {fecha(m.fecha_muestra)}
                  <br />
                  Aceite: {m.horas_aceite == null ? 'Sin dato' : `${m.horas_aceite} h`}
                  <br />
                  {valor(m.laboratorio)} · Informe {valor(m.numero_informe)}
                </div>
                <div>
                  <span className={`dx-ui-pill is-${color[m.condicion] || 'gray'}`}>
                    <span className="dot" />
                    {etiquetas[m.condicion] || 'Sin resultado'}
                  </span>
                  <p>{etiquetas[m.estado]}</p>
                  {backlog(m) && <button onClick={() => onNav?.('backlog')}>Backlog {backlog(m)}</button>}
                </div>
                <div>
                  <button onClick={() => detalle(m)}>Detalle</button>
                  {perm.editar && ['registrada', 'con_resultado'].includes(m.estado) && (
                    <button onClick={() => resultados(m)}>Cargar resultados</button>
                  )}
                  {permBacklog?.crear && m.condicion === 'alerta' && !backlog(m) && (
                    <button onClick={() => crearBacklog(m)}>Crear backlog</button>
                  )}
                </div>
              </article>
            ))}
          </>
        ) : (
          <>
            {todosLimites.map((l) => (
              <article className="dx-confsos-fila" key={l.id}>
                <strong>{l.elemento}</strong>
                <span>
                  {l.sistema || 'Todos los sistemas'} · {l.empresa_id ? 'Empresa' : 'Global'}
                </span>
                <span>{limiteTexto(l)}</span>
                {perm.editar && (
                  <button
                    onClick={() => abrir('limite', { ...l, id: l.empresa_id ? l.id : undefined, empresa_id: empresa })}
                  >
                    {l.empresa_id ? 'Editar' : 'Crear límite propio'}
                  </button>
                )}
              </article>
            ))}
          </>
        )}
      </div>
      {modal && (
        <div className="dx-ui-overlay">
          <div className="dx-ui-dialog dx-ui-dialog-wide" role="dialog" aria-modal="true" aria-label="Análisis SOS">
            <div className="dx-ui-dialog-head">
              <h2>
                {
                  {
                    muestra: 'Nueva muestra',
                    resultados: 'Cargar resultados',
                    detalle: 'Detalle de muestra',
                    limite: 'Límite propio',
                  }[modal]
                }
              </h2>
              <button onClick={cerrar}>Cerrar</button>
            </div>
            {modal === 'detalle' ? (
              <div>
                <p>
                  {valor(activo(seleccion.activo_id)?.codigo)} · {seleccion.sistema} · {fecha(seleccion.fecha_muestra)}
                </p>
                {(seleccion.resultados || []).map((r) => {
                  const l = limites.find((x) => x.elemento === r.elemento);
                  return (
                    <div key={r.id}>
                      <strong>
                        {r.elemento}: {r.valor} {r.unidad}
                      </strong>{' '}
                      · {etiquetas[r.nivel]} · {l ? limiteTexto(l) : 'Sin límite'}
                      {l?.tipo === 'max' && <progress value={Math.min(100, (r.valor / l.critico) * 100)} max="100" />}
                    </div>
                  );
                })}
                <h3>Tendencia por muestra</h3>
                {(() => {
                  const serie = muestras
                    .filter(
                      (m) => m.activo_id === seleccion.activo_id && m.sistema === seleccion.sistema && m.condicion,
                    )
                    .slice(0, 10)
                    .reverse();
                  const puntos = serie
                    .map(
                      (m, i) => `${20 + i * 35},${90 - ({ normal: 0, alerta: 1, critico: 2 }[m.condicion] || 0) * 35}`,
                    )
                    .join(' ');
                  return serie.length ? (
                    <>
                      <svg
                        className="dx-confsos-grafico"
                        viewBox="0 0 360 110"
                        role="img"
                        aria-label="Tendencia de condición: normal, alerta y crítico"
                      >
                        <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth="2" />
                        {serie.map((m, i) => (
                          <circle
                            key={m.id}
                            cx={20 + i * 35}
                            cy={90 - ({ normal: 0, alerta: 1, critico: 2 }[m.condicion] || 0) * 35}
                            r="4"
                          >
                            <title>
                              {fecha(m.fecha_muestra)}: {etiquetas[m.condicion]}
                            </title>
                          </circle>
                        ))}
                      </svg>
                      <p>Abajo: normal · centro: alerta · arriba: crítico</p>
                    </>
                  ) : (
                    <p>Sin resultados anteriores.</p>
                  );
                })()}
                {seleccion.informe_path && (
                  <button
                    onClick={async () => {
                      try {
                        window.open(await urlInformeSos(seleccion.informe_path), '_blank', 'noopener,noreferrer');
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Abrir informe PDF
                  </button>
                )}
                {perm.editar && seleccion.estado === 'con_resultado' && (
                  <button
                    onClick={async () => {
                      try {
                        await marcarMuestraRevisada(seleccion.id);
                        setModal('');
                        setAviso('Muestra revisada.');
                        await cargar();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Marcar revisada
                  </button>
                )}
                {error && <p role="alert">{error}</p>}
              </div>
            ) : (
              <form onSubmit={guardar} onChange={() => setSucio(true)} noValidate>
                <div className="dx-ui-form-grid">
                  {modal === 'muestra' && (
                    <>
                      <Campo nombre="activo_id" etiqueta="Equipo" requerido {...{ form, setForm, errores }}>
                        <input
                          list="dx-confsos-activos"
                          name="activo_id"
                          value={form.activo_id}
                          onChange={(e) => setForm({ ...form, activo_id: e.target.value })}
                        />
                        <datalist id="dx-confsos-activos">
                          {activos.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.codigo} {a.nombre}
                            </option>
                          ))}
                        </datalist>
                      </Campo>
                      {[
                        ['sistema', 'Sistema', 'text', true],
                        ['tipo_aceite', 'Tipo de aceite'],
                        ['horometro_muestra', 'Horómetro de la muestra', 'number'],
                        ['horas_aceite', 'Horas del aceite', 'number'],
                        ['fecha_muestra', 'Fecha de muestra', 'date', true],
                        ['laboratorio', 'Laboratorio'],
                        ['numero_informe', 'Número de informe'],
                      ].map(([n, l, t, r]) => (
                        <Campo key={n} nombre={n} etiqueta={l} tipo={t} requerido={r} {...{ form, setForm, errores }} />
                      ))}
                    </>
                  )}
                  {modal === 'limite' && (
                    <>
                      {[
                        ['sistema', 'Sistema (vacío para todos)'],
                        ['elemento', 'Elemento', 'text', true],
                        ['unidad', 'Unidad', 'text', true],
                        ['alerta', 'Alerta', 'number', true],
                        ['critico', 'Crítico', 'number', true],
                      ].map(([n, l, t, r]) => (
                        <Campo key={n} nombre={n} etiqueta={l} tipo={t} requerido={r} {...{ form, setForm, errores }} />
                      ))}
                      <Campo nombre="tipo" etiqueta="Tipo" {...{ form, setForm, errores }}>
                        <select
                          name="tipo"
                          value={form.tipo}
                          onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                        >
                          <option value="max">Máximo</option>
                          <option value="rango">Rango</option>
                        </select>
                      </Campo>
                      {form.tipo === 'rango' && (
                        <>
                          <Campo
                            nombre="minimo"
                            etiqueta="Mínimo normal"
                            tipo="number"
                            {...{ form, setForm, errores }}
                          />
                          <Campo
                            nombre="maximo"
                            etiqueta="Máximo normal"
                            tipo="number"
                            {...{ form, setForm, errores }}
                          />
                        </>
                      )}
                    </>
                  )}
                  {modal === 'resultados' && (
                    <>
                      <Campo
                        nombre="fecha_resultado"
                        etiqueta="Fecha de resultado"
                        tipo="date"
                        requerido
                        {...{ form, setForm, errores }}
                      />
                      <Campo nombre="recomendacion" etiqueta="Recomendación" {...{ form, setForm, errores }} />
                      <label className="dx-ui-field">
                        <span>Informe PDF</span>
                        <input
                          name="informe"
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => setArchivo(e.target.files[0] || null)}
                        />
                        {errores.informe && <span className="dx-ui-field-error">{errores.informe}</span>}
                      </label>
                      <label className="dx-ui-field">
                        <span>Importar CSV o XLSX</span>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={(e) => e.target.files[0] && importar(e.target.files[0])}
                        />
                      </label>
                    </>
                  )}
                </div>
                {modal === 'resultados' && (
                  <>
                    <p>Los límites vigentes son orientativos y deben validarse para cada aplicación.</p>
                    {preview.length > 0 && (
                      <div>
                        <h3>Previsualización</h3>
                        {preview.map((p, i) => (
                          <p key={i}>
                            {p.nombre} → {p.elemento || 'Elemento no reconocido'}: {valor(p.valor)}{' '}
                            {p.valido ? '' : '(no se aplicará)'}
                          </p>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setValores({
                              ...valores,
                              ...Object.fromEntries(preview.filter((p) => p.valido).map((p) => [p.elemento, p.valor])),
                            });
                            setPreview([]);
                          }}
                        >
                          Aplicar valores reconocidos
                        </button>
                      </div>
                    )}
                    <div className="dx-confsos-resultados">
                      {limites.map((l) => (
                        <label key={l.id}>
                          <span>
                            {l.elemento} ({l.unidad}) · {limiteTexto(l)}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={valores[l.elemento] ?? ''}
                            onChange={(e) => setValores({ ...valores, [l.elemento]: e.target.value })}
                          />
                          <span>{etiquetas[nivelSos(valores[l.elemento], l)] || 'Sin dato'}</span>
                        </label>
                      ))}
                    </div>
                    {errores.valores && (
                      <p className="dx-ui-field-error" role="alert">
                        {errores.valores}
                      </p>
                    )}
                    <p>
                      Condición prevista:{' '}
                      {etiquetas[condicionSos(limites.map((l) => nivelSos(valores[l.elemento], l)))] || 'Sin dato'}
                    </p>
                  </>
                )}
                <div className="dx-ui-dialog-foot">
                  {error && <span role="alert">{error}</span>}
                  <button type="submit">Guardar</button>
                </div>
              </form>
            )}
            {confirmar && (
              <div role="alertdialog" aria-label="Cambios sin guardar">
                <p>Hay cambios sin guardar. ¿Descartarlos?</p>
                <button
                  onClick={() => {
                    setModal('');
                    setConfirmar(false);
                    setSucio(false);
                  }}
                >
                  Descartar
                </button>
                <button onClick={() => setConfirmar(false)}>Seguir editando</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

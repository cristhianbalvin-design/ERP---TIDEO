import React, { useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { getSupabaseClient } from '../../../lib/supabaseClient.js';
import {
  estadoPm,
  listarPlanesPm,
  listarActivosPorSegmento,
  guardarPlanPm,
  registrarEjecucionPm,
} from '../../../services/confiabilidadService.js';
import { formatoHoras, etiquetaConfiabilidad } from './confiabilidadLogic.js';

const fecha = (x) => (x ? x.slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const textos = { vencido: 'Vencido', por_vencer: 'Por vencer', al_dia: 'Al día', sin_lectura: 'Sin lectura' };
const colores = { vencido: 'red', por_vencer: 'amber', al_dia: 'green', sin_lectura: 'gray' };
const vacio = {
  nombre: '',
  alcance: 'modelo',
  marca: '',
  modelo: '',
  activo_id: '',
  intervalo_horas: '',
  intervalo_dias: '',
  tolerancia_pct: 10,
  tareas: [],
  vigente: true,
};
const valor = (x) => (x == null || x === '' ? 'Sin dato' : x);
async function acceso(empresa) {
  const db = getSupabaseClient();
  return Object.fromEntries(
    await Promise.all(
      ['ver', 'crear', 'editar'].map(async (accion) => {
        const { data, error } = await db.rpc('usuario_puede', {
          target_empresa_id: empresa,
          target_pantalla: 'programacion_pm',
          target_accion: accion,
        });
        return [accion, !error && !!data];
      }),
    ),
  );
}
function Campo({ nombre, etiqueta, form, setForm, errores, tipo = 'text', requerido = false, children }) {
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
export function ProgramacionPmPage({ onNav }) {
  const sesion = useSesionOperativa();
  const empresa = sesion.empresaId || sesion.empresa?.id,
    sociedad = sesion.sociedadId || sesion.sociedad?.id || null;
  const [perm, setPerm] = useState(null),
    [filas, setFilas] = useState([]),
    [planes, setPlanes] = useState([]),
    [activos, setActivos] = useState([]);
  const [cargando, setCargando] = useState(true),
    [error, setError] = useState(''),
    [aviso, setAviso] = useState('');
  const [tab, setTab] = useState('programa'),
    [busqueda, setBusqueda] = useState(''),
    [segmento, setSegmento] = useState('todos'),
    [filtro, setFiltro] = useState('todos');
  const [modal, setModal] = useState(''),
    [form, setForm] = useState(vacio),
    [errores, setErrores] = useState({}),
    [seleccion, setSeleccion] = useState(null),
    [historial, setHistorial] = useState([]),
    [sucio, setSucio] = useState(false),
    [confirmar, setConfirmar] = useState(false);
  async function cargar() {
    if (!empresa) return;
    setCargando(true);
    setError('');
    try {
      const p = await acceso(empresa);
      setPerm(p);
      if (p.ver) {
        const [f, pl, a] = await Promise.all([
          estadoPm(empresa, sociedad),
          listarPlanesPm(empresa),
          listarActivosPorSegmento(empresa),
        ]);
        setFilas(f || []);
        setPlanes(pl);
        setActivos(a);
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
  function abrir(m, f, s = null) {
    setModal(m);
    setForm(f);
    setSeleccion(s);
    setErrores({});
    setError('');
    setSucio(false);
    setConfirmar(false);
  }
  function cerrar() {
    if (sucio) setConfirmar(true);
    else setModal('');
  }
  async function detalle(f) {
    abrir('detalle', {}, f);
    setHistorial([]);
    try {
      const { data, error: err } = await getSupabaseClient()
        .from('conf_pm_ejecuciones')
        .select('*')
        .eq('empresa_id', empresa)
        .eq('programa_id', f.programa_id)
        .order('fecha', { ascending: false });
      if (err) throw err;
      setHistorial(data || []);
    } catch (e) {
      setError(e.message);
    }
  }
  function generar(f) {
    const plan = planes.find((p) => p.id === f.plan_id);
    localStorage.setItem(
      'zahory_ot_contexto',
      JSON.stringify({
        pm_programa_id: f.programa_id,
        equipo_id: f.activo_id,
        tipo_trabajo: 'Preventivo_PM',
        descripcion: [f.plan_nombre, ...(plan?.tareas || [])].join('\n'),
        origen: 'pm',
      }),
    );
    onNav?.('crear-ot');
  }
  async function guardar(e) {
    e.preventDefault();
    const err = {};
    if (modal === 'plan') {
      if (!form.nombre.trim()) err.nombre = 'Ingresa el nombre.';
      if (form.alcance === 'modelo' && !form.marca) err.marca = 'Elige una marca.';
      if (form.alcance === 'modelo' && !form.modelo) err.modelo = 'Elige un modelo.';
      if (form.alcance === 'activo' && !activos.some((a) => a.id === form.activo_id))
        err.activo_id = 'Elige un activo de la lista.';
      if (!form.intervalo_horas && !form.intervalo_dias) {
        err.intervalo_horas = 'Indica horas o días.';
        err.intervalo_dias = 'Indica horas o días.';
      }
      if (form.intervalo_horas && Number(form.intervalo_horas) <= 0) err.intervalo_horas = 'Debe ser mayor que cero.';
      if (form.intervalo_dias && (!Number.isInteger(Number(form.intervalo_dias)) || Number(form.intervalo_dias) <= 0))
        err.intervalo_dias = 'Ingresa días enteros positivos.';
      if (form.tolerancia_pct === '' || Number(form.tolerancia_pct) < 0 || Number(form.tolerancia_pct) > 100)
        err.tolerancia_pct = 'Debe estar entre 0 y 100.';
    } else {
      if (!form.fecha) err.fecha = 'Indica la fecha.';
      if (form.horometro === '' || Number(form.horometro) < 0) err.horometro = 'Indica un horómetro válido.';
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
      if (modal === 'plan') {
        const id = await guardarPlanPm({ ...form, empresa_id: empresa, tareas: form.tareas.filter((x) => x.trim()) });
        const actual = await estadoPm(empresa, sociedad);
        setAviso(`${actual.filter((x) => x.plan_id === id).length} equipos programados.`);
      } else {
        await registrarEjecucionPm(seleccion.programa_id, form.fecha, Number(form.horometro), form.observacion || null);
        setAviso('PM realizado registrado.');
      }
      setSucio(false);
      setModal('');
      await cargar();
    } catch (ex) {
      setError(ex.message);
    }
  }
  const visibles = filas.filter(
    (f) =>
      (filtro === 'todos' || f.semaforo === filtro) &&
      (segmento === 'todos' || f.segmento === segmento) &&
      `${f.activo_codigo} ${f.activo_nombre} ${f.plan_nombre}`.toLowerCase().includes(busqueda.toLowerCase()),
  );
  const marcas = [...new Set(activos.map((a) => a.marca).filter(Boolean))],
    modelos = [
      ...new Set(
        activos
          .filter((a) => a.marca === form.marca)
          .map((a) => a.modelo)
          .filter(Boolean),
      ),
    ];
  if (!empresa && sesion.estado !== 'cargando')
    return (
      <section className="dx-ui">
        <div className="dx-ui-empty">{sesion.error || 'Selecciona una empresa para consultar la programación.'}</div>
      </section>
    );
  if (!empresa || cargando)
    return (
      <section className="dx-ui">
        <div className="dx-ui-empty">Cargando programación…</div>
      </section>
    );
  if (!perm?.ver)
    return (
      <section className="dx-ui">
        <div className="dx-ui-empty">{error || 'No tienes permiso para ver Programación PM.'}</div>
      </section>
    );
  return (
    <section className="dx-ui dx-confpm-root">
      <header>
        <small>CONFIABILIDAD</small>
        <h1>Programación de mantenimiento preventivo</h1>
        <p>Planes para flota en alquiler, máquinas de taller y equipos de clientes.</p>
      </header>
      <div className="dx-ui-kpi-row">
        {[
          ['Vencidos', filas.filter((x) => x.semaforo === 'vencido').length],
          ['Por vencer', filas.filter((x) => x.semaforo === 'por_vencer').length],
          ['Al día', filas.filter((x) => x.semaforo === 'al_dia').length],
          ['Sin lectura', filas.filter((x) => x.semaforo === 'sin_lectura').length],
          ['OT de PM en curso', filas.filter((x) => x.ot_activa_id).length],
        ].map(([l, n]) => (
          <div className="dx-ui-kpi" key={l}>
            <strong>{n}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
      {aviso && <p role="status">{aviso}</p>}
      {error && !modal && <p role="alert">{error}</p>}
      <nav>
        <button type="button" onClick={() => setTab('programa')}>
          Programa
        </button>
        <button type="button" onClick={() => setTab('planes')}>
          Planes
        </button>
      </nav>
      <div className="dx-ui-card dx-confpm-card">
        <div className="dx-ui-toolbar">
          <h2>{tab === 'programa' ? 'Programa' : 'Planes'}</h2>
          <span className="dx-ui-count">{tab === 'programa' ? visibles.length : planes.length} registros</span>
          {tab === 'planes' && perm.crear && (
            <button onClick={() => abrir('plan', { ...vacio, tareas: [] })}>Nuevo plan</button>
          )}
        </div>
        {tab === 'programa' ? (
          <>
            <div className="dx-confpm-filtros">
              <input
                aria-label="Buscar equipo o plan"
                placeholder="Buscar equipo o plan"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <select aria-label="Semáforo" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="todos">Todos los estados</option>
                {Object.entries(textos).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select aria-label="Segmento" value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="flota">Flota en alquiler</option>
                <option value="taller">Máquinas de taller</option>
                <option value="cliente">Equipos de clientes</option>
              </select>
            </div>
            <p>Flota: equipos en alquiler · Taller: máquinas propias · Cliente: equipos de terceros.</p>
            {!visibles.length && (
              <div className="dx-ui-empty">
                {filas.length
                  ? 'No hay programas que coincidan con los filtros.'
                  : 'No hay programas de mantenimiento.'}
              </div>
            )}
            {visibles.map((f) => {
              const ratios = [
                [f.horas_restantes, f.intervalo_horas],
                [f.dias_restantes, f.intervalo_dias],
              ].filter(([r, i]) => r != null && i > 0);
              const consumo = ratios.length
                ? Math.max(0, Math.min(100, 100 * (1 - Math.min(...ratios.map(([r, i]) => r / i)))))
                : null;
              const horasPrimero =
                f.horas_restantes != null &&
                (f.dias_restantes == null ||
                  f.horas_restantes / f.intervalo_horas <= f.dias_restantes / f.intervalo_dias);
              return (
                <article className="dx-confpm-fila" key={f.programa_id}>
                  <div>
                    <strong>
                      {valor(f.activo_codigo)} · {valor(f.activo_nombre)}
                    </strong>
                    <p>
                      {f.plan_nombre} · {etiquetaConfiabilidad('segmento', f.segmento)}
                    </p>
                    <span className={`dx-ui-pill is-${colores[f.semaforo]}`}>
                      <span className="dot" />
                      {textos[f.semaforo]}
                    </span>
                  </div>
                  <div>
                    Actual: {formatoHoras(f.horometro_actual)}
                    <br />
                    Último: {formatoHoras(f.horometro_ultimo)} · {fecha(f.fecha_ultimo)}
                    <br />
                    Próximo: {formatoHoras(f.proximo_horometro)} · {fecha(f.proxima_fecha)}
                  </div>
                  <div>
                    Restante:{' '}
                    <b>
                      {horasPrimero
                        ? formatoHoras(f.horas_restantes)
                        : f.dias_restantes == null
                          ? 'Sin dato'
                          : `${f.dias_restantes} días`}
                    </b>
                    {f.horas_restantes != null && f.dias_restantes != null && (
                      <span> / {horasPrimero ? `${f.dias_restantes} días` : formatoHoras(f.horas_restantes)}</span>
                    )}
                    {consumo != null && <progress max="100" value={consumo} aria-label="Consumo del intervalo" />}
                    {f.semaforo === 'sin_lectura' && (
                      <p>Registra lecturas en partes de flota, reportes mina o cierre de OT.</p>
                    )}
                  </div>
                  <div>
                    <button onClick={() => detalle(f)}>Detalle e historial</button>
                    {perm.crear && !f.ot_activa_id && <button onClick={() => generar(f)}>Generar OT</button>}
                    {perm.crear && (
                      <button onClick={() => abrir('ejecucion', { fecha: '', horometro: '', observacion: '' }, f)}>
                        Registrar PM realizado
                      </button>
                    )}
                    {f.ot_activa_id && (
                      <button onClick={() => onNav?.('ots')}>Ver OT {valor(f.ot_activa_numero)}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </>
        ) : (
          <>
            {planes.length === 0 && <div className="dx-ui-empty">No hay planes registrados.</div>}
            {planes.map((p) => (
              <article className="dx-confpm-fila" key={p.id}>
                <strong>{p.nombre}</strong>
                <span>
                  {p.alcance === 'modelo'
                    ? `${p.marca} ${p.modelo}`
                    : activos.find((a) => a.id === p.activo_id)?.codigo || p.activo_id}
                </span>
                <span>{p.vigente ? 'Vigente' : 'No vigente'}</span>
                {perm.editar && (
                  <button onClick={() => abrir('plan', { ...p, tareas: [...(p.tareas || [])] })}>Editar</button>
                )}
              </article>
            ))}
          </>
        )}
      </div>
      {modal && (
        <div className="dx-ui-overlay">
          <div
            className="dx-ui-dialog dx-ui-dialog-wide"
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'plan' ? 'Plan PM' : modal === 'detalle' ? 'Historial PM' : 'Registrar PM realizado'}
          >
            <div className="dx-ui-dialog-head">
              <h2>
                {modal === 'plan'
                  ? 'Plan PM'
                  : modal === 'detalle'
                    ? 'Historial de ejecuciones'
                    : 'Registrar PM realizado'}
              </h2>
              <button onClick={cerrar}>Cerrar</button>
            </div>
            {modal === 'detalle' ? (
              <div>
                {historial.length ? (
                  historial.map((h) => (
                    <p key={h.id}>
                      {fecha(h.fecha)} · {formatoHoras(h.horometro)} · {h.origen === 'ot' ? 'OT' : 'Manual'} ·{' '}
                      {valor(h.observacion)}
                    </p>
                  ))
                ) : (
                  <p>Sin ejecuciones registradas.</p>
                )}
              </div>
            ) : (
              <form onSubmit={guardar} onChange={() => setSucio(true)} noValidate>
                <div className="dx-ui-form-grid">
                  {modal === 'plan' ? (
                    <>
                      <Campo nombre="nombre" etiqueta="Nombre" requerido {...{ form, setForm, errores }} />
                      <Campo nombre="alcance" etiqueta="Alcance" requerido {...{ form, setForm, errores }}>
                        <select
                          name="alcance"
                          className="dx-ui-select"
                          value={form.alcance}
                          onChange={(e) => setForm({ ...form, alcance: e.target.value })}
                        >
                          <option value="modelo">Por modelo</option>
                          <option value="activo">Por equipo</option>
                        </select>
                      </Campo>
                      {form.alcance === 'modelo' ? (
                        <>
                          <Campo nombre="marca" etiqueta="Marca" requerido {...{ form, setForm, errores }}>
                            <select
                              name="marca"
                              className="dx-ui-select"
                              value={form.marca || ''}
                              onChange={(e) => setForm({ ...form, marca: e.target.value, modelo: '' })}
                            >
                              <option value="">Seleccionar</option>
                              {marcas.map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                          </Campo>
                          <Campo nombre="modelo" etiqueta="Modelo" requerido {...{ form, setForm, errores }}>
                            <select
                              name="modelo"
                              className="dx-ui-select"
                              value={form.modelo || ''}
                              onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                            >
                              <option value="">Seleccionar</option>
                              {modelos.map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                          </Campo>
                        </>
                      ) : (
                        <Campo nombre="activo_id" etiqueta="Activo" requerido {...{ form, setForm, errores }}>
                          <input
                            list="dx-confpm-activos"
                            name="activo_id"
                            value={form.activo_id || ''}
                            onChange={(e) => setForm({ ...form, activo_id: e.target.value })}
                          />
                          <datalist id="dx-confpm-activos">
                            {activos.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.codigo} {a.nombre}
                              </option>
                            ))}
                          </datalist>
                        </Campo>
                      )}
                      <Campo
                        nombre="intervalo_horas"
                        etiqueta="Intervalo (horas)"
                        tipo="number"
                        {...{ form, setForm, errores }}
                      />
                      <Campo
                        nombre="intervalo_dias"
                        etiqueta="Intervalo (días)"
                        tipo="number"
                        {...{ form, setForm, errores }}
                      />
                      <Campo
                        nombre="tolerancia_pct"
                        etiqueta="Tolerancia (%)"
                        tipo="number"
                        {...{ form, setForm, errores }}
                      />
                      <label className="dx-ui-field">
                        <span>Tareas (una por línea)</span>
                        <textarea
                          value={(form.tareas || []).join('\n')}
                          onChange={(e) => setForm({ ...form, tareas: e.target.value.split('\n') })}
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={form.vigente}
                          onChange={(e) => setForm({ ...form, vigente: e.target.checked })}
                        />{' '}
                        Vigente
                      </label>
                    </>
                  ) : (
                    <>
                      <Campo nombre="fecha" etiqueta="Fecha" tipo="date" requerido {...{ form, setForm, errores }} />
                      <Campo
                        nombre="horometro"
                        etiqueta="Horómetro"
                        tipo="number"
                        requerido
                        {...{ form, setForm, errores }}
                      />
                      <Campo nombre="observacion" etiqueta="Observación" {...{ form, setForm, errores }} />
                    </>
                  )}
                </div>
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

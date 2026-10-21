import React, { useEffect, useMemo, useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { recetasActividadService, mensajeErrorRecetaActividad } from './services/recetasActividadService.js';
import './recetas_actividad.css';

// Editor de recetas de actividad (Maestros): Trabajo › Actividad › tareas con cargo,
// horas, equipo y horas-máquina. Las tarifas vienen de Variables de costeo; aquí solo
// se definen cantidades. Guardar no modifica Hojas de Costeo existentes.

const numero = value => Number(value || 0);
const money = value => `S/ ${numero(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horasTxt = value => `${numero(value).toLocaleString('es-PE', { maximumFractionDigits: 2 })} h`;
const normalizar = texto => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');
const firma = filas => JSON.stringify((filas || []).map(fila => [fila.tarea_id, fila.cargo_id || null, numero(fila.horas), fila.activo_id || null, fila.activo_id ? numero(fila.horas_maquina) : 0]));
const ESTADOS = { ok: ['Completa', 'ok'], warn: ['Por completar', 'warn'], off: ['Sin tareas', 'off'] };

export default function RecetasActividad() {
  const { empresa, navigate, addToast } = useApp();
  const empresaId = empresa?.id;
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [familias, setFamilias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [tarifas, setTarifas] = useState(new Map());
  const [activos, setActivos] = useState([]);
  const [usdPorPen, setUsdPorPen] = useState(null);
  const [recetas, setRecetas] = useState(new Map()); // actividad_id -> filas guardadas
  const [actividadId, setActividadId] = useState('');
  const [filas, setFilas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [busquedaTarea, setBusquedaTarea] = useState('');
  const [menuTareas, setMenuTareas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [creandoTarea, setCreandoTarea] = useState(false);

  const cargar = async () => {
    if (!empresaId || !isSupabaseConfigured()) { setCargando(false); return; }
    setCargando(true); setErrorCarga('');
    try {
      const sb = await getSupabaseClient();
      const [fam, act, tar, car, pla, man, eqp, rec, tc, perm] = await Promise.all([
        sb.from('familia_trabajo').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
        sb.from('tipos_servicio_interno').select('id, codigo, nombre, familia_trabajo_id').eq('empresa_id', empresaId).eq('estado', 'activo').eq('rol', 'actividad').order('nombre'),
        sb.from('tipos_servicio_interno').select('id, codigo, nombre').eq('empresa_id', empresaId).eq('estado', 'activo').eq('rol', 'tarea').order('nombre'),
        sb.from('cargos_empresa').select('id, codigo, nombre').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre'),
        sb.from('vw_costo_hora_planilla_por_cargo').select('cargo_id, costo_hora_planilla').eq('empresa_id', empresaId),
        sb.from('costo_hora_cargo_config').select('cargo_id, costo_hora_manual').eq('empresa_id', empresaId),
        sb.from('vw_depreciacion_mensual_activo').select('activo_id, nombre, estado, costo_hora_activo_usd').eq('empresa_id', empresaId).order('nombre'),
        sb.from('plantillas_actividad').select('actividad_id, tarea_id, cargo_id, horas, activo_id, horas_maquina, orden').eq('empresa_id', empresaId).order('orden'),
        sb.rpc('obtener_tipo_cambio_vigente', { p_moneda_base: 'PEN' }),
        sb.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'maestros', target_accion: 'editar' }),
      ]);
      const error = [fam, act, tar, car, pla, man, eqp, rec].map(item => item.error).find(Boolean);
      if (error) throw error;
      const tarifasCargo = new Map();
      (pla.data || []).forEach(item => { if (numero(item.costo_hora_planilla) > 0) tarifasCargo.set(item.cargo_id, numero(item.costo_hora_planilla)); });
      (man.data || []).forEach(item => { if (item.costo_hora_manual != null && numero(item.costo_hora_manual) > 0) tarifasCargo.set(item.cargo_id, numero(item.costo_hora_manual)); });
      const porActividad = new Map();
      (rec.data || []).forEach(fila => {
        if (!porActividad.has(fila.actividad_id)) porActividad.set(fila.actividad_id, []);
        porActividad.get(fila.actividad_id).push({ ...fila, horas: numero(fila.horas), horas_maquina: numero(fila.horas_maquina) });
      });
      setFamilias(fam.data || []);
      setActividades(act.data || []);
      setTareas(tar.data || []);
      setCargos(car.data || []);
      setTarifas(tarifasCargo);
      setActivos((eqp.data || []).filter(item => item.estado !== 'dado_baja'));
      setRecetas(porActividad);
      setUsdPorPen(numero(tc.data) > 0 ? numero(tc.data) : null);
      setPuedeEditar(perm.data === true);
      setActividadId(actual => (act.data || []).some(item => item.id === actual) ? actual : ((act.data || [])[0]?.id || ''));
    } catch (error) {
      setErrorCarga(/permission|row-level/i.test(error?.message || '') ? 'No tienes permiso para ver las recetas.' : 'No se pudieron cargar las recetas. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardadas = recetas.get(actividadId) || [];
  useEffect(() => { setFilas((recetas.get(actividadId) || []).map(fila => ({ ...fila }))); setBusquedaTarea(''); }, [actividadId, recetas]);

  const familiaPorId = useMemo(() => new Map(familias.map(item => [item.id, item])), [familias]);
  const tareaPorId = useMemo(() => new Map(tareas.map(item => [item.id, item])), [tareas]);
  const activoPorId = useMemo(() => new Map(activos.map(item => [item.activo_id, item])), [activos]);
  const costoEquipo = activoId => {
    const usd = activoPorId.get(activoId)?.costo_hora_activo_usd;
    if (usd == null || !usdPorPen) return null;
    return numero(usd) / usdPorPen;
  };
  const costoMo = fila => (tarifas.get(fila.cargo_id) || 0) * numero(fila.horas);
  const costoMaq = fila => fila.activo_id ? (costoEquipo(fila.activo_id) || 0) * numero(fila.horas_maquina) : 0;
  const estadoDe = lista => !lista.length ? 'off' : lista.every(fila => fila.cargo_id && numero(fila.horas) > 0) ? 'ok' : 'warn';

  const hayCambios = firma(filas) !== firma(guardadas);
  const listaEstado = id => id === actividadId ? filas : (recetas.get(id) || []);
  const conteo = useMemo(() => {
    const c = { ok: 0, warn: 0, off: 0 };
    actividades.forEach(item => { c[estadoDe(item.id === actividadId ? filas : (recetas.get(item.id) || []))] += 1; });
    return c;
  }, [actividades, recetas, filas, actividadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const mapa = new Map();
    actividades.forEach(item => {
      const trabajo = familiaPorId.get(item.familia_trabajo_id)?.nombre || 'Sin trabajo';
      if (q && !normalizar(`${item.nombre} ${item.codigo || ''} ${trabajo}`).includes(q)) return;
      if (filtro !== 'todas' && estadoDe(listaEstado(item.id)) !== filtro) return;
      if (!mapa.has(trabajo)) mapa.set(trabajo, []);
      mapa.get(trabajo).push(item);
    });
    return [...mapa.entries()].sort(([a], [b]) => a === 'Sin trabajo' ? 1 : b === 'Sin trabajo' ? -1 : a.localeCompare(b, 'es'));
  }, [actividades, familiaPorId, busqueda, filtro, recetas, filas, actividadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const actividad = actividades.find(item => item.id === actividadId);
  const incluidas = new Set(filas.map(fila => fila.tarea_id));
  const sugerencias = useMemo(() => {
    const q = normalizar(busquedaTarea.trim());
    return tareas.filter(item => !incluidas.has(item.id) && (!q || normalizar(`${item.nombre} ${item.codigo || ''}`).includes(q))).slice(0, 12);
  }, [tareas, busquedaTarea, filas]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirActividad = id => {
    if (id === actividadId) return;
    if (hayCambios && !window.confirm('Tienes cambios sin guardar en esta receta. ¿Descartarlos y cambiar de actividad?')) return;
    setActividadId(id);
  };
  const cambiar = (indice, cambios) => setFilas(actuales => actuales.map((fila, i) => {
    if (i !== indice) return fila;
    const siguiente = { ...fila, ...cambios };
    if (!siguiente.activo_id) siguiente.horas_maquina = 0;
    return siguiente;
  }));
  const mover = (indice, delta) => setFilas(actuales => {
    const destino = indice + delta;
    if (destino < 0 || destino >= actuales.length) return actuales;
    const copia = [...actuales];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    return copia;
  });
  const agregar = tarea => {
    setFilas(actuales => [...actuales, { tarea_id: tarea.id, cargo_id: null, horas: 0, activo_id: null, horas_maquina: 0 }]);
    setBusquedaTarea(''); setMenuTareas(false);
  };
  const crearTarea = async () => {
    const nombre = busquedaTarea.trim();
    if (!nombre || creandoTarea) return;
    setCreandoTarea(true);
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.rpc('buscar_o_crear_tipo_servicio_interno', { p_empresa_id: empresaId, p_nombre: nombre, p_rol: 'tarea', p_familia_trabajo_id: null });
      if (error) throw error;
      setTareas(actuales => [...actuales.filter(item => item.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      agregar(data);
    } catch (error) {
      addToast(error.message || 'No se pudo crear la tarea.', 'error');
    } finally {
      setCreandoTarea(false);
    }
  };
  const guardar = async () => {
    if (!puedeEditar || !hayCambios || guardando || !actividadId) return;
    setGuardando(true);
    try {
      await recetasActividadService.guardarReceta(empresaId, actividadId, guardadas, filas);
      setRecetas(actuales => new Map(actuales).set(actividadId, filas.map((fila, i) => ({ ...fila, actividad_id: actividadId, orden: i + 1, horas_maquina: fila.activo_id ? numero(fila.horas_maquina) : 0 }))));
      addToast(`Receta de ${actividad?.nombre || 'la actividad'} guardada.`, 'success');
    } catch (error) {
      addToast(mensajeErrorRecetaActividad(error), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const totalHoras = filas.reduce((s, fila) => s + numero(fila.horas), 0);
  const totalHorasMaq = filas.reduce((s, fila) => s + (fila.activo_id ? numero(fila.horas_maquina) : 0), 0);
  const totalCosto = filas.reduce((s, fila) => s + costoMo(fila) + costoMaq(fila), 0);

  const renderFila = (fila, indice) => {
    const tarea = tareaPorId.get(fila.tarea_id);
    const tarifa = fila.cargo_id ? tarifas.get(fila.cargo_id) : null;
    const tarifaEquipo = fila.activo_id ? costoEquipo(fila.activo_id) : null;
    const falta = !fila.cargo_id || !(numero(fila.horas) > 0);
    return <div className={`rcx-grid rcx-row ${falta ? 'is-incomplete' : ''}`} key={`${fila.tarea_id}:${indice}`}>
      <div className="rcx-ord">
        <button type="button" aria-label="Subir tarea" disabled={!puedeEditar || indice === 0} onClick={() => mover(indice, -1)}>{I.arrowUp}</button>
        <button type="button" aria-label="Bajar tarea" disabled={!puedeEditar || indice === filas.length - 1} onClick={() => mover(indice, 1)}>{I.arrowDown}</button>
      </div>
      <div className="rcx-tname"><b>{tarea?.nombre || 'Tarea no disponible'}</b><small>{tarea?.codigo || fila.tarea_id}{falta ? ' · falta cargo u horas' : ''}</small></div>
      <div className="rcx-ttot"><b>{money(costoMo(fila) + costoMaq(fila))}</b></div>
      <label className="rcx-kv rcx-k1"><span>Cargo</span><select className="rcx-cell" disabled={!puedeEditar} value={fila.cargo_id || ''} onChange={event => cambiar(indice, { cargo_id: event.target.value || null })}><option value="">Sin cargo</option>{cargos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label className="rcx-kv rcx-k2"><span>Horas</span><input className="rcx-cell num" type="number" inputMode="decimal" min="0" step="0.5" disabled={!puedeEditar} value={fila.horas ? fila.horas : ''} placeholder="0" onChange={event => cambiar(indice, { horas: Math.max(0, numero(event.target.value)) })} /></label>
      <div className="rcx-kv rcx-k3"><span>Costo mano de obra</span><div className={`rcx-cost ${fila.cargo_id && tarifa == null ? 'is-alert' : ''}`}><b>{money(costoMo(fila))}</b><small>{!fila.cargo_id ? '—' : tarifa == null ? 'Sin tarifa' : `${money(tarifa)} / h`}</small></div></div>
      <label className="rcx-kv rcx-k4"><span>Equipo</span><select className="rcx-cell" disabled={!puedeEditar} value={fila.activo_id || ''} onChange={event => cambiar(indice, { activo_id: event.target.value || null })}><option value="">Sin equipo</option>{activos.map(item => <option key={item.activo_id} value={item.activo_id}>{item.nombre}</option>)}</select></label>
      <label className="rcx-kv rcx-k5"><span>Horas-máq.</span><input className="rcx-cell num" type="number" inputMode="decimal" min="0" step="0.5" disabled={!puedeEditar || !fila.activo_id} value={fila.horas_maquina ? fila.horas_maquina : ''} placeholder="0" onChange={event => cambiar(indice, { horas_maquina: Math.max(0, numero(event.target.value)) })} /></label>
      <div className="rcx-kv rcx-k6"><span>Costo máquina</span><div className={`rcx-cost ${fila.activo_id ? '' : 'is-muted'}`}><b>{fila.activo_id ? money(costoMaq(fila)) : '—'}</b>{fila.activo_id && <small>{tarifaEquipo == null ? 'Sin costo' : `${money(tarifaEquipo)} / h`}</small>}</div></div>
      <button className="rcx-del" type="button" aria-label="Quitar tarea" disabled={!puedeEditar} onClick={() => setFilas(actuales => actuales.filter((_, i) => i !== indice))}>{I.x}</button>
    </div>;
  };

  return <div className="rcx-page">
    <header className="rcx-head">
      <div>
        <button className="rcx-back" type="button" onClick={() => navigate('maestros')}>← Maestros</button>
        <div className="rcx-eyebrow">Maestros · Costeo</div>
        <h1>Recetas de actividad</h1>
        <div className="rcx-sub">Tareas, cargo, horas y equipo con que arranca cada actividad en el diagnóstico y en la Hoja de Costeo.</div>
      </div>
      <button className="rcx-btn" type="button" onClick={() => navigate('costeo_variables')}>Ver variables de costeo</button>
    </header>

    {errorCarga ? <div className="rcx-alert" role="alert">{errorCarga}</div> : <>
      <div className="rcx-chips">
        <div className="rcx-chip"><b>{actividades.length}</b><span>actividades</span></div>
        <div className="rcx-chip"><b>{conteo.ok}</b><span>recetas completas</span></div>
        <div className="rcx-chip is-warn"><b>{conteo.warn}</b><span>sin horas o sin cargo</span></div>
        <div className="rcx-chip"><b>{conteo.off}</b><span>sin tareas</span></div>
      </div>
      <div className="rcx-layout">
        <section className="rcx-card" aria-label="Actividades por trabajo">
          <div className="rcx-toolbar"><input className="rcx-search" value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Buscar trabajo o actividad…" aria-label="Buscar actividad" /></div>
          <div className="rcx-filters" role="group" aria-label="Filtrar por estado">
            {[['todas', 'Todas'], ['warn', 'Por completar'], ['ok', 'Completas'], ['off', 'Sin tareas']].map(([id, label]) => <button key={id} type="button" className="rcx-filter" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}
          </div>
          <div className="rcx-tree">
            {cargando ? <div className="rcx-empty">Cargando actividades…</div>
              : !actividades.length ? <div className="rcx-empty">No hay actividades activas. Créalas en Maestros › Trabajos.</div>
              : !grupos.length ? <div className="rcx-empty">No hay actividades que coincidan.</div>
              : grupos.map(([trabajo, items]) => <div className="rcx-group" key={trabajo}>
                <div className="rcx-ghead">{trabajo}</div>
                {items.map(item => { const lista = listaEstado(item.id); const [label, clase] = ESTADOS[estadoDe(lista)]; return <button key={item.id} type="button" className="rcx-act" aria-current={item.id === actividadId} onClick={() => elegirActividad(item.id)}>
                  <span className="rcx-actname"><b>{item.nombre}</b><small>{item.codigo || 'Sin código'} · {lista.length} tareas</small></span>
                  <span className={`rcx-pill ${clase}`}><i />{label}</span>
                </button>; })}
              </div>)}
          </div>
        </section>

        <section className="rcx-card rcx-detail" aria-label="Receta de la actividad">
          {!actividad ? <div className="rcx-empty">{cargando ? 'Cargando…' : 'Selecciona una actividad.'}</div> : <>
            <div className="rcx-dhead">
              <div><div className="rcx-route">{familiaPorId.get(actividad.familia_trabajo_id)?.nombre || 'Sin trabajo'} › <b>{actividad.codigo || 'Sin código'}</b></div><h2>{actividad.nombre}</h2></div>
              <div className="rcx-totals"><div><small>Horas-hombre</small><b>{horasTxt(totalHoras)}</b></div><div><small>Horas-máquina</small><b>{horasTxt(totalHorasMaq)}</b></div><div><small>Costo estimado</small><b>{money(totalCosto)}</b></div></div>
            </div>
            <div className="rcx-grid rcx-th"><div /><div /><div className="rcx-cat">Mano de obra</div><div className="rcx-cat is-maq">Máquina</div><div /></div>
            <div className="rcx-grid rcx-th"><div>#</div><div>Tarea</div><div>Cargo</div><div>Horas</div><div className="num">Costo</div><div>Equipo</div><div>Horas-máq.</div><div className="num">Costo</div><div /></div>
            {filas.length ? <div className="rcx-rows">{filas.map(renderFila)}</div> : <div className="rcx-empty">Esta actividad todavía no tiene tareas.{puedeEditar ? ' Agrega la primera abajo.' : ''}</div>}
            {puedeEditar && <div className="rcx-add">
              <input className="rcx-search" value={busquedaTarea} onChange={event => { setBusquedaTarea(event.target.value); setMenuTareas(true); }} onFocus={() => setMenuTareas(true)} onBlur={() => setTimeout(() => setMenuTareas(false), 150)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (sugerencias[0]) agregar(sugerencias[0]); } if (event.key === 'Escape') setMenuTareas(false); }} placeholder="Escribe para buscar y añadir una tarea (nombre o código)…" aria-label="Agregar tarea" />
              <button className="rcx-btn" type="button" disabled={!busquedaTarea.trim() || creandoTarea} onClick={crearTarea}>{I.plus} {creandoTarea ? 'Creando…' : 'Crear tarea'}</button>
              {menuTareas && <div className="rcx-menu" role="listbox">{sugerencias.length ? sugerencias.map(item => <button key={item.id} type="button" role="option" aria-selected="false" onMouseDown={event => event.preventDefault()} onClick={() => agregar(item)}><span>{item.nombre}</span><small>{item.codigo || ''}</small></button>) : <div className="rcx-menu-empty">{busquedaTarea.trim() ? `No existe. Usa «Crear tarea» para crear «${busquedaTarea.trim()}».` : 'No quedan tareas por agregar.'}</div>}</div>}
            </div>}
            <div className="rcx-note">La tarifa del cargo y el costo del equipo vienen de <b>Variables de costeo</b>; aquí solo se definen cantidades. El costo es una estimación con las tarifas de hoy. Guardar no cambia las Hojas de Costeo que ya existen.</div>
          </>}
        </section>
      </div>
    </>}

    <footer className="rcx-foot">
      <div className={`rcx-status ${hayCambios ? 'is-dirty' : ''}`}><i /><span>{!puedeEditar ? 'Solo lectura' : hayCambios ? `Cambios sin guardar en ${actividad?.nombre || 'la receta'}` : 'Sin cambios'}</span></div>
      <div className="rcx-spacer" />
      {puedeEditar && <>
        <button className="rcx-btn" type="button" disabled={!hayCambios || guardando} onClick={() => setFilas(guardadas.map(fila => ({ ...fila })))}>Descartar</button>
        <button className="rcx-btn primary" type="button" disabled={!hayCambios || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar receta'}</button>
      </>}
    </footer>
  </div>;
}

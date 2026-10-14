import { esOtPlanificable } from './plannerEngine.js';
import {
  arbolTareas, claveCargo, colorCargo, diferenciaHabiles, fmtCorto, fmtDia, horas, normalizar,
  nombrePuesto, numeroOT, ocupacionPuesto, puestoDeOT, resumenTarea, sumarHabiles, ubicacionMaquina,
} from './plannerModelo.js';

const ICONO_OK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);
const ICONO_CANDADO = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
  </svg>
);

export function PlannerSide({
  datos, infos, alertas, cargos, dias, hoy, seleccion, permiteEscritura, guardando,
  onSelect, onPlanificar, onConfigurar, onResponsable, onMaquina, onNoAntes, onPuesto,
}) {
  const info = seleccion?.ot ? infos.get(seleccion.ot.id) : null;
  return (
    <aside className="dx-pl-side" aria-label="Detalle de la OT">
      {info
        ? <DetalleOT datos={datos} info={info} cargos={cargos} dias={dias} hoy={hoy} tareaId={seleccion.tareaId} onSelect={onSelect} />
        : (
          <section className="dx-pl-panel">
            <div className="dx-pl-pb">
              <h2 className="dx-pl-ot-t">Elige una OT</h2>
              <p className="dx-pl-muted">Selecciona una orden en el panel, el tablero o el gemelo para ver sus fechas, tareas y recursos.</p>
            </div>
          </section>
        )}
      {info && (
        <AsignarTarea
          datos={datos}
          info={info}
          cargos={cargos}
          hoy={hoy}
          tareaId={seleccion.tareaId}
          tecnicoId={seleccion.tecnicoId}
          bloqueado={!permiteEscritura || guardando}
          onPlanificar={onPlanificar}
          onConfigurar={onConfigurar}
          onResponsable={onResponsable}
          onMaquina={onMaquina}
          onNoAntes={onNoAntes}
          onPuesto={onPuesto}
        />
      )}
      <PanelAlertas alertas={alertas} onSelect={onSelect} datos={datos} />
    </aside>
  );
}

function tareaElegida(info, tareaId) {
  const tareas = info.ot.ot_tareas || [];
  return tareas.find(item => item.id === tareaId)
    || tareas.find(item => (Number(item.horas_reales) || 0) < (Number(item.horas_estimadas) || 0))
    || tareas[0] || null;
}

function DetalleOT({ datos, info, cargos, dias, hoy, tareaId, onSelect }) {
  const { ot } = info;
  const hermanas = (datos.ots || []).filter(item => item.os_cliente_id && item.os_cliente_id === ot.os_cliente_id && item.id !== ot.id);
  const cerrada = info.st === 'done';
  const elegida = tareaElegida(info, tareaId);
  const pills = { ok: 'is-ok', warn: 'is-warn', bad: 'is-bad', done: 'is-done', none: 'is-none' };
  return (
    <section className="dx-pl-panel">
      <div className="dx-pl-pb">
        <div>
          <div className="dx-pl-eyebrow" style={{ color: 'var(--dx-pl-fg3)' }}>{ot.numero || ot.id}</div>
          <h2 className="dx-pl-ot-t">{ot.descripcion || ot.servicio || 'Orden de trabajo'}</h2>
          <p className="dx-pl-muted">
            {ot.orden_servicio?.numero || 'Sin orden de servicio'}
            {hermanas.length ? ` · la misma OS tiene ${hermanas.map(item => item.numero || item.id).join(', ')}` : ' · una sola OT'}
          </p>
        </div>
        <div><span className={`dx-pl-pill ${pills[info.st]}`}>{info.label}</span></div>
        {!cerrada && (
          <>
            <dl className="dx-pl-dl">
              <dt>Compromiso (OS)</dt><dd>{info.comp ? fmtDia(info.comp) : 'Sin compromiso'}</dd>
              <dt>Entrega probable</dt><dd>{fmtDia(info.end)}</dd>
              <dt>Si las horas suben 25%</dt><dd>{fmtDia(info.p90)}</dd>
            </dl>
            <Rango info={info} dias={dias} hoy={hoy} />
          </>
        )}
        <div className="dx-pl-hsum">
          <div>Estimadas<b>{horas(info.est)}</b>del diagnóstico</div>
          <div>Reales<b>{horas(info.real)}</b>de partes diarios</div>
          <div>Pendientes<b>{horas(info.pend)}</b>{info.pct}% de avance</div>
        </div>
        <details className="dx-pl-oth">
          <summary>De dónde viene esta OT</summary>
          <ul className="dx-pl-chain">
            <li><span><small>Orden de servicio</small><b>{ot.orden_servicio?.numero || '—'}</b></span></li>
            <li className="is-me"><span><small>Orden de trabajo</small><b>{ot.numero || ot.id}</b></span></li>
          </ul>
          <p className="dx-pl-conf" style={{ marginTop: 8 }}>
            Las tareas, sus horas y su Trabajo y Actividad se heredan de la orden de servicio al planificar la OT.
          </p>
        </details>
        <ListaTareas datos={datos} info={info} cargos={cargos} elegida={elegida} onSelect={onSelect} />
      </div>
    </section>
  );
}

function Rango({ info, dias, hoy }) {
  const horizonte = 20;
  const inicio = dias[0];
  const pos = fecha => `${Math.min(100, Math.max(0, (diferenciaHabiles(inicio, fecha) / (horizonte - 1)) * 100))}%`;
  return (
    <>
      <div className="dx-pl-rng" aria-hidden="true">
        <div className="axis" />
        <div className="td" style={{ left: pos(hoy) }} />
        {info.end && <div className="p9" style={{ left: pos(info.end), width: `calc(${pos(info.p90 || info.end)} - ${pos(info.end)})` }} />}
        {info.end && <div className="p5" style={{ left: pos(info.end) }} />}
        {info.comp && <div className="cp" style={{ left: pos(info.comp) }} />}
      </div>
      <div className="dx-pl-rngl"><span>{fmtCorto(inicio)}</span><span>{fmtCorto(sumarHabiles(inicio, horizonte - 1))}</span></div>
    </>
  );
}

function ListaTareas({ datos, info, cargos, elegida, onSelect }) {
  const grupos = arbolTareas(info.ot);
  if (!grupos.length) {
    return <p className="dx-pl-conf">Esta OT aún no tiene tareas heredadas. Usa «Planificar OT» para traerlas.</p>;
  }
  return (
    <ul className="dx-pl-tl">
      {grupos.map(grupo => [
        grupo.trabajo && <li key={`t-${grupo.trabajo}`} className="g2"><span className="dx-pl-lv">Trabajo</span><b>{grupo.trabajo}</b></li>,
        ...grupo.actividades.flatMap(actividad => [
          actividad.actividad && <li key={`a-${grupo.trabajo}-${actividad.actividad}`} className="g2 is-act">
            <span className="dx-pl-lv">Actividad</span><b>{actividad.actividad}</b>
          </li>,
          ...actividad.tareas.map(tarea => {
            const resumen = resumenTarea(datos, info.ot, tarea);
            const cuando = resumen.terminada ? 'Entregada'
              : resumen.desde ? `${fmtCorto(resumen.desde)}${resumen.hasta !== resumen.desde ? ` – ${fmtCorto(resumen.hasta)}` : ''}` : 'Sin fechas';
            return (
              <li key={tarea.id}>
                <button
                  type="button"
                  className={`dx-pl-trow${resumen.sobre ? ' is-bad' : ''}${elegida?.id === tarea.id ? ' is-on' : ''}`}
                  style={{ '--c': colorCargo(cargos, resumen.tecnicos[0] ? claveCargo(resumen.tecnicos[0]) : resumen.cargo) }}
                  aria-pressed={elegida?.id === tarea.id}
                  onClick={() => onSelect({ ot: info.ot, tareaId: tarea.id })}
                >
                  <i />
                  <span className="n">
                    <span className="dx-pl-lv">Tarea</span>
                    <b>
                      {tarea.titulo || 'Tarea'}
                      {resumen.terminada && <span className="dx-pl-chip is-mut">Entregada</span>}
                    </b>
                    <span>{resumen.cargo} · {resumen.tecnicos.map(item => item.nombre).join(', ') || 'sin asignar'}</span>
                  </span>
                  <span className="r">{horas(resumen.real)} / {horas(resumen.est)}<em>{cuando}</em></span>
                </button>
              </li>
            );
          }),
        ]),
      ])}
    </ul>
  );
}

function AsignarTarea({
  datos, info, cargos, hoy, tareaId, tecnicoId, bloqueado, onPlanificar, onConfigurar, onResponsable, onMaquina, onNoAntes, onPuesto,
}) {
  const tarea = tareaElegida(info, tareaId);
  if (!tarea) return null;
  const resumen = resumenTarea(datos, info.ot, tarea);
  if (!esOtPlanificable(info.ot) || resumen.terminada) {
    return (
      <section className="dx-pl-panel">
        <div className="dx-pl-ph"><h2>«{tarea.titulo || 'Tarea'}»</h2><span className="dx-pl-pill is-done">Entregada</span></div>
        <div className="dx-pl-pb">
          <div className="dx-pl-lock">
            {ICONO_CANDADO}
            <div>
              <b>{esOtPlanificable(info.ot) ? 'Tarea entregada: ya no se asignan personas ni equipos.' : 'La OT está cerrada y no admite cambios.'}</b>
              <br />Se ejecutó con {horas(resumen.real)} reales{resumen.tecnicos[0] ? ` (${resumen.tecnicos[0].nombre})` : ''}.
            </div>
          </div>
        </div>
      </section>
    );
  }
  const sinPlan = !resumen.personas.length;
  const primario = resumen.tecnicos.some(item => item.id === tecnicoId) ? tecnicoId : resumen.tecnicos[0]?.id || null;
  const opciones = opcionesResponsable(datos, resumen, primario);
  const mismas = opciones.filter(item => item.misma || item.actual);
  const otras = opciones.filter(item => !item.misma && !item.actual);
  const elegir = persona => {
    if (bloqueado || sinPlan || persona.id === primario) return;
    onResponsable(resumen.personas.filter(item => item.tecnico_id === primario), persona.id);
  };
  const boton = item => (
    <li key={item.persona.id}>
      <button
        type="button"
        className={`dx-pl-tc${item.actual ? ' is-cur' : ''}`}
        aria-current={item.actual ? 'true' : undefined}
        disabled={bloqueado || sinPlan}
        onClick={() => elegir(item.persona)}
      >
        <b>{item.persona.nombre}</b>
        <span className="s">{item.sub}</span>
        <span className={`a ${item.clase}`}>{item.tag}</span>
      </button>
    </li>
  );
  const puesto = puestoDeOT(datos, info.ot.id);
  const desde = resumen.desde;
  const fechasNoAntes = [];
  let cursor = desde && desde < hoy ? desde : hoy;
  while (fechasNoAntes.length < 10) { fechasNoAntes.push(cursor); cursor = sumarHabiles(cursor, 1); }
  if (desde && !fechasNoAntes.includes(desde)) fechasNoAntes.unshift(desde);
  const maquinaActual = resumen.maquinas[0]?.id || '';
  return (
    <section className="dx-pl-panel">
      <div className="dx-pl-ph"><h2>Asignar «{tarea.titulo || 'Tarea'}»</h2></div>
      <div className="dx-pl-pb">
        {sinPlan && (
          <div className="dx-pl-lock">
            <div>
              <b>Esta tarea aún no tiene recursos ni fechas.</b><br />
              Planifica la OT para asignar responsable, máquina y puesto.
              <div style={{ marginTop: 8 }}>
                <button type="button" className="dx-pl-btn is-pri is-sm" disabled={bloqueado} onClick={() => onPlanificar(info.ot)}>Planificar OT</button>
              </div>
            </div>
          </div>
        )}
        <div className="dx-pl-stpr">
          <div><b>Personas en la tarea</b><small>Más personas acortan la tarea</small></div>
          <output>{resumen.tecnicos.length}</output>
        </div>
        <h3>Responsable</h3>
        <ul className="dx-pl-tcs">{mismas.map(boton)}</ul>
        {otras.length > 0 && (
          <details className="dx-pl-oth">
            <summary>Cubrir con otra especialidad ({otras.length})</summary>
            <ul className="dx-pl-tcs">{otras.map(boton)}</ul>
          </details>
        )}
        <label className="dx-pl-fld">
          Máquina que usa
          <select
            value={maquinaActual}
            disabled={bloqueado || !resumen.equipos.length}
            onChange={event => event.target.value && onMaquina(resumen.equipos.filter(item => item.maquina_id === maquinaActual), event.target.value)}
          >
            <option value="">Sin máquina</option>
            {(datos.maquinas || []).filter(maquina => maquina.estado !== 'baja').map(maquina => (
              <option key={maquina.id} value={maquina.id}>{maquina.nombre} · {ubicacionMaquina(datos, maquina)}</option>
            ))}
          </select>
        </label>
        <label className="dx-pl-fld">
          No empezar antes de
          <select
            value={desde || ''}
            disabled={bloqueado || sinPlan}
            onChange={event => {
              const delta = diferenciaHabiles(desde, event.target.value);
              if (delta) onNoAntes([...resumen.personas, ...resumen.equipos], delta);
            }}
          >
            {!desde && <option value="">Sin restricción</option>}
            {fechasNoAntes.map(fecha => <option key={fecha} value={fecha}>{fmtDia(fecha)}</option>)}
          </select>
        </label>
        <label className="dx-pl-fld">
          Puesto del equipo
          <select
            value={puesto?.id || ''}
            disabled={bloqueado || sinPlan || !(datos.puestos || []).length}
            onChange={event => event.target.value && onPuesto(info.ot, event.target.value)}
          >
            {!puesto && <option value="">Sin puesto</option>}
            {(datos.puestos || []).map(item => {
              const libres = cupoLibre(datos, item, info);
              return (
                <option key={item.id} value={item.id}>
                  {nombrePuesto(datos, item)} · {libres > 0 ? `${libres} libre${libres > 1 ? 's' : ''}` : 'lleno'} de {item.capacidad || 1}
                </option>
              );
            })}
          </select>
        </label>
        <p className="dx-pl-conf">
          Los cambios se guardan al momento y se pueden deshacer.{' '}
          <button type="button" className="dx-pl-mini" style={{ height: 22 }} onClick={onConfigurar}>Cambiar en Configurar taller</button>
        </p>
      </div>
    </section>
  );
}

function cupoLibre(datos, puesto, info) {
  const capacidad = Math.max(1, Number(puesto.capacidad) || 1);
  const desde = info.inicio;
  const hasta = info.end || info.inicio;
  let maximo = 0;
  for (let fecha = desde; fecha && fecha <= hasta; fecha = sumarHabiles(fecha, 1)) {
    maximo = Math.max(maximo, ocupacionPuesto(datos, puesto.id, fecha, info.ot.id).length);
  }
  return capacidad - maximo;
}

function opcionesResponsable(datos, resumen, primario) {
  const fechas = new Set([...resumen.personas.map(item => item.fecha)]);
  const cargoTarea = normalizar(resumen.cargo);
  const filas = (datos.personas || []).map(persona => {
    const actual = persona.id === primario;
    const misma = !resumen.tarea.cargo?.nombre || normalizar(claveCargo(persona)) === cargoTarea;
    const otra = (datos.asignaciones || []).find(item => item.tecnico_id === persona.id && fechas.has(item.fecha)
      && item.tarea_id !== resumen.tarea.id && item.estado === 'programado');
    const otraOT = otra ? (datos.ots || []).find(ot => ot.id === otra.ot_id) : null;
    let tag = 'Libre';
    let clase = 'is-ok';
    let sub = claveCargo(persona);
    let orden = 1;
    if (actual) { tag = 'Asignado'; clase = 'is-cur'; orden = 0; }
    else if (otra && misma) { tag = 'Intercambiar'; clase = 'is-warn'; sub = `Esos días en ${numeroOT(otraOT)} · ${claveCargo(persona)}`; orden = 2; }
    else if (!misma) { tag = 'Otra especialidad'; clase = 'is-warn'; sub = `${claveCargo(persona)}${otra ? ` · ocupado en ${numeroOT(otraOT)}` : ''}`; orden = 3; }
    return { persona, actual, misma, tag, clase, sub, orden };
  });
  return filas.sort((a, b) => a.orden - b.orden || a.persona.nombre.localeCompare(b.persona.nombre, 'es'));
}

function PanelAlertas({ alertas, onSelect, datos }) {
  return (
    <section className="dx-pl-panel">
      <div className="dx-pl-ph">
        <h2>Alertas y sugerencias</h2>
        <span className={`dx-pl-pill ${alertas.length ? 'is-bad' : 'is-ok'}`}>{alertas.length}</span>
      </div>
      <div className="dx-pl-pb">
        {alertas.length
          ? (
            <ul className="dx-pl-alerts">
              {alertas.map((alerta, indice) => {
                const ot = (datos.ots || []).find(item => item.id === alerta.otId);
                return (
                  <li key={`${alerta.titulo}-${indice}`}>
                    <button
                      type="button"
                      className="dx-pl-alert"
                      style={{ '--c': alerta.sev === 'bad' ? 'var(--dx-pl-bad)' : 'var(--dx-pl-warn)' }}
                      disabled={!ot}
                      onClick={() => ot && onSelect({ ot, tareaId: alerta.tareaId || null })}
                    >
                      <span className="sev" />
                      <span><b>{alerta.titulo}</b><span>{alerta.mensaje}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
          : <p className="dx-pl-ok-empty">{ICONO_OK}Todo dentro de compromiso y sin cuellos de botella.</p>}
      </div>
    </section>
  );
}

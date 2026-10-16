import { useRef, useState } from 'react';
import { esOtPlanificable } from './plannerEngine.js';
import {
  ausencia, bloquesRecurso, claveCargo, colorCargo, diaSemana, fmtCorto, fmtDia, horas, indiceHoy, nombrePuesto,
  normalizar, numeroOT, ocupacionPuesto, tareaDe, ubicacionMaquina,
} from './plannerModelo.js';

const ICONO_AVISO = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" />
  </svg>
);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function BoardView({ datos, modelo, seleccion, permiteEscritura, onSelect, onMoverBloque, onMoverUnidad, onConfigurar }) {
  const { dias, cargos } = modelo;
  const hoyIdx = indiceHoy(dias, modelo.hoy);
  const arrastre = useRef(false);
  const [destino, setDestino] = useState(null);
  const ots = new Map((datos.ots || []).map(ot => [ot.id, ot]));
  const contexto = { datos, modelo, dias, hoyIdx, cargos, ots, seleccion, permiteEscritura, onSelect, arrastre, iniciarArrastre };

  // Arrastre con eventos de puntero: funciona con mouse real y en pantallas táctiles.
  function claveBajo(raiz, x, y, tipo) {
    const objetivo = raiz.elementFromPoint?.(x, y);
    if (!objetivo) return null;
    if (tipo === 'unidad') {
      const grupo = objetivo.closest('[data-puesto-id]');
      return grupo ? { clave: `b:${grupo.dataset.puestoId}`, puestoId: grupo.dataset.puestoId } : null;
    }
    const pista = objetivo.closest('[data-carril-id]');
    if (!pista) return null;
    const { carrilTabla: tabla, carrilId: id } = pista.dataset;
    return { clave: `${tabla === 'persona' ? 'p' : 'm'}:${id}`, tabla, id, pista };
  }

  function soltar(dato, bajo, x) {
    if (!bajo) return;
    if (dato.tipo === 'unidad') {
      if (bajo.puestoId !== dato.puestoId) onMoverUnidad(dato.ot, bajo.puestoId);
      return;
    }
    const pista = bajo.pista.getBoundingClientRect();
    const ancho = pista.width / dias.length;
    const indice = Math.max(0, Math.min(dias.length - 1, Math.floor((x - pista.left) / ancho) - dato.agarre));
    const delta = indice - dato.bloque.s;
    const cambiaRecurso = bajo.tabla === dato.tabla && bajo.id !== dato.recursoId ? bajo.id : null;
    if (!delta && !cambiaRecurso) return;
    onMoverBloque({ tabla: dato.tabla, asignaciones: dato.bloque.asignaciones, delta, recursoDestino: cambiaRecurso });
  }

  function iniciarArrastre(event, dato) {
    if (!permiteEscritura || event.button !== 0) return;
    const elemento = event.currentTarget;
    const raiz = elemento.getRootNode();
    const x0 = event.clientX;
    const y0 = event.clientY;
    const scroll0 = window.scrollY;
    let activo = false;
    let ultimo = null;
    let desplazar = 0;
    // Si el puntero se acerca al borde de la ventana, la página se desplaza para llegar a otros puestos.
    const reloj = setInterval(() => {
      if (!activo || !desplazar || !ultimo) return;
      window.scrollBy(0, desplazar);
      mover(ultimo);
    }, 30);
    const limpiar = () => {
      clearInterval(reloj);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', terminar);
      window.removeEventListener('pointercancel', cancelar);
      elemento.classList.remove('is-drag');
      elemento.style.transform = '';
      elemento.style.pointerEvents = '';
      setDestino(null);
    };
    function mover(e) {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0 + window.scrollY - scroll0;
      if (!activo && Math.hypot(dx, dy) < 5) return;
      activo = true;
      ultimo = { clientX: e.clientX, clientY: e.clientY, preventDefault() {} };
      desplazar = e.clientY < 48 ? -14 : e.clientY > window.innerHeight - 48 ? 14 : 0;
      e.preventDefault();
      elemento.classList.add('is-drag');
      elemento.style.pointerEvents = 'none';
      elemento.style.transform = `translate(${dx}px, ${dy}px)`;
      const bajo = claveBajo(raiz, e.clientX, e.clientY, dato.tipo);
      setDestino(bajo?.clave || null);
    }
    function terminar(e) {
      limpiar();
      if (!activo) return;
      arrastre.current = true;
      setTimeout(() => { arrastre.current = false; }, 0);
      soltar(dato, claveBajo(raiz, e.clientX, e.clientY, dato.tipo), e.clientX);
    }
    function cancelar() { limpiar(); }
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', cancelar);
  }

  return (
    <section className="dx-pl-panel" aria-labelledby="pl-board">
      <div className="dx-pl-ph">
        <h2 id="pl-board">Tablero de recursos · {fmtCorto(dias[0])} al {fmtCorto(dias.at(-1))}</h2>
        <div className="dx-pl-legend">
          {cargos.map(cargo => <span key={cargo}><i style={{ '--c': colorCargo(cargos, cargo) }} />{cargo}</span>)}
          <span><i style={{ '--c': 'var(--dx-pl-bad)' }} />Con alerta</span>
        </div>
      </div>
      <div className="dx-pl-board" tabIndex={-1}>
        <div className="dx-pl-grid" style={{ '--n': dias.length }}>
          <div className="dx-pl-row dx-pl-hrow">
            <div className="dx-pl-lab"><b>Recurso</b><span>Horas por bloque</span></div>
            <div style={{ display: 'flex' }}>
              {dias.map((dia, indice) => (
                <div key={dia} className={`dx-pl-dh${indice === hoyIdx ? ' is-today' : ''}`}>
                  <b>{new Date(`${dia}T12:00:00`).getDate()} {MESES[new Date(`${dia}T12:00:00`).getMonth()]}</b>
                  <span>{diaSemana(dia)}{indice === hoyIdx ? ' · hoy' : ''}</span>
                </div>
              ))}
            </div>
          </div>
          <Seccion titulo="Personal" />
          {(datos.personas || []).map(persona => (
            <Carril
              key={persona.id}
              contexto={contexto}
              titulo={persona.nombre}
              detalle={claveCargo(persona)}
              tabla="persona"
              recursoId={persona.id}
              bloques={bloquesRecurso(datos.asignaciones || [], 'tecnico_id', persona.id, dias)}
              color={colorCargo(cargos, claveCargo(persona))}
              persona={persona}
              resaltado={destino === `p:${persona.id}`}
            />
          ))}
          {!(datos.personas || []).length && <Vacio texto="No hay personal activo en esta sociedad." />}
          <Seccion titulo="Máquinas de taller" />
          {(datos.maquinas || []).filter(maquina => maquina.estado !== 'baja').map(maquina => (
            <Carril
              key={maquina.id}
              contexto={contexto}
              titulo={maquina.nombre}
              detalle={`${ubicacionMaquina(datos, maquina)} · ${Number(maquina.horas_dia) || 8} h/día`}
              tabla="equipo"
              recursoId={maquina.id}
              bloques={bloquesRecurso(datos.equipos || [], 'maquina_id', maquina.id, dias)}
              espejo
              resaltado={destino === `m:${maquina.id}`}
            />
          ))}
          {!(datos.maquinas || []).some(maquina => maquina.estado !== 'baja') && <Vacio texto="No hay máquinas configuradas." />}
          <Seccion titulo="Puestos" accion={<button type="button" className="dx-pl-mini" onClick={onConfigurar}>Configurar taller</button>} />
          {(datos.puestos || []).map(puesto => (
            <GrupoPuesto
              key={puesto.id}
              contexto={contexto}
              puesto={puesto}
              resaltado={destino === `b:${puesto.id}`}
            />
          ))}
          {!(datos.puestos || []).length && <Vacio texto="No hay puestos configurados. Usa «Configurar taller»." />}
        </div>
      </div>
      <p className="dx-pl-hint">
        Cada bloque muestra horas, no días: lo calcula el Planner. Arrastra un bloque a otro técnico para fijarlo como
        responsable, o a otro día para moverlo. Arrastra un equipo a otro puesto para cambiarlo. Las tareas entregadas y las
        OT cerradas no se mueven. Para cambiar bahías o máquinas usa «Configurar taller».
      </p>
    </section>
  );
}

function Seccion({ titulo, accion = null }) {
  return (
    <div className="dx-pl-row dx-pl-sec">
      <div className="dx-pl-lab"><span>{titulo}</span>{accion}</div>
      <div className="dx-pl-trk" />
    </div>
  );
}

function Vacio({ texto }) {
  return (
    <div className="dx-pl-row dx-pl-lane is-vacio">
      <div className="dx-pl-lab"><b style={{ color: 'var(--dx-pl-fg3)' }}>—</b></div>
      <div className="dx-pl-trk">{texto}</div>
    </div>
  );
}

function BaseCarril({ hoyIdx }) {
  return (
    <>
      <div className="dx-pl-past" style={{ width: `calc(${hoyIdx} * var(--dw))` }} />
      <div className="dx-pl-tline" style={{ left: `calc(${hoyIdx} * var(--dw))` }} />
    </>
  );
}

function Carril({ contexto, titulo, detalle, tabla, recursoId, bloques, color, persona, espejo = false, resaltado }) {
  const filas = bloques[0]?.filas || 1;
  return (
    <div
      className={`dx-pl-row dx-pl-lane${filas > 2 ? ' is-tall' : ''}${resaltado ? ' is-drop' : ''}`}
      style={filas > 2 ? { '--rows': filas } : undefined}
    >
      <div className="dx-pl-lab"><b>{titulo}</b><span>{detalle}</span></div>
      <div className="dx-pl-trk" data-carril-tabla={tabla} data-carril-id={recursoId}>
        <BaseCarril hoyIdx={contexto.hoyIdx} />
        {persona && contexto.dias.map((dia, indice) => {
          const motivo = ausencia(contexto.datos, persona.id, dia);
          return motivo
            ? <div key={dia} className="dx-pl-offd" style={{ left: `calc(${indice} * var(--dw))`, width: 'var(--dw)' }}>{motivo}</div>
            : null;
        })}
        {bloques.map(bloque => (
          <Bloque key={bloque.clave} contexto={contexto} bloque={bloque} tabla={tabla} recursoId={recursoId} color={color} persona={persona} espejo={espejo} />
        ))}
      </div>
    </div>
  );
}

function Bloque({ contexto, bloque, tabla, recursoId, color, persona, espejo }) {
  const { datos, modelo, ots, cargos, seleccion, permiteEscritura, onSelect, arrastre, iniciarArrastre, hoyIdx } = contexto;
  const ot = ots.get(bloque.otId);
  const tarea = bloque.tareaId ? tareaDe(datos, bloque.otId, bloque.tareaId) : null;
  const info = modelo.infos.get(bloque.otId);
  const responsable = persona || (datos.personas || []).find(item => (datos.asignaciones || [])
    .some(asig => asig.tecnico_id === item.id && asig.tarea_id === bloque.tareaId && asig.ot_id === bloque.otId));
  const tono = color || (responsable ? colorCargo(cargos, claveCargo(responsable)) : 'var(--dx-pl-sk0)');
  const otraEspecialidad = persona && tarea?.cargo?.nombre && normalizar(tarea.cargo.nombre) !== normalizar(claveCargo(persona));
  const ausente = persona && bloque.asignaciones.some(item => ausencia(datos, persona.id, item.fecha));
  const conAlerta = info?.st === 'bad' || otraEspecialidad || ausente;
  const pasado = bloque.e < hoyIdx;
  const editable = permiteEscritura && ot && esOtPlanificable(ot) && bloque.asignaciones.every(item => item.estado === 'programado');
  const elegido = seleccion?.ot?.id === bloque.otId && (!seleccion?.tareaId || seleccion.tareaId === bloque.tareaId);
  const fino = bloque.filas > 1;
  const nombre = tarea?.titulo || ot?.descripcion || 'Trabajo';
  const corto = (ot?.numero || bloque.otId || '').toString();
  const etiqueta = `${numeroOT(ot)} ${nombre}, ${horas(bloque.h)}, ${fmtDia(modelo.dias[bloque.s])}${conAlerta ? ', con alerta' : ''}`;
  const clases = ['dx-pl-blk', fino && 'is-thin', conAlerta && 'is-bad', elegido && 'is-sel', espejo && 'is-mirror', pasado && 'is-done'].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={clases}
      aria-label={etiqueta}
      title={editable ? 'Arrastra a otro día o a otro recurso' : 'No editable'}
      onPointerDown={editable ? event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ancho = rect.width / (bloque.e - bloque.s + 1);
        iniciarArrastre(event, { tipo: 'bloque', tabla, recursoId, bloque, agarre: Math.max(0, Math.floor((event.clientX - rect.left) / ancho)) });
      } : undefined}
      onClick={() => !arrastre.current && ot && onSelect({ ot, tareaId: bloque.tareaId, tecnicoId: tabla === 'persona' ? recursoId : null })}
      style={{
        '--c': tono,
        ...(editable ? { touchAction: 'none' } : {}),
        left: `calc(${bloque.s} * var(--dw) + 3px)`,
        width: `calc(${bloque.e - bloque.s + 1} * var(--dw) - 6px)`,
        ...(fino ? { top: `${4 + bloque.fila * 25}px` } : {}),
      }}
    >
      {conAlerta && <span className="ic">{ICONO_AVISO}</span>}
      {fino
        ? <strong>{corto} · {nombre} · {horas(bloque.h)}</strong>
        : <><small>{corto} · {horas(bloque.h)}</small><strong>{nombre}</strong></>}
    </button>
  );
}

function GrupoPuesto({ contexto, puesto, resaltado }) {
  const { datos, modelo, dias, ots, cargos, seleccion, permiteEscritura, onSelect, arrastre, iniciarArrastre, hoyIdx } = contexto;
  const capacidad = Math.max(1, Number(puesto.capacidad) || 1);
  const bahia = (datos.bahias || []).find(item => item.id === puesto.bahia_id);
  const unidades = (datos.ocupaciones || []).filter(item => item.puesto_id === puesto.id && item.estado !== 'cancelado'
    && item.fecha_hasta >= dias[0] && item.fecha_desde <= dias.at(-1));
  return (
    <div className={`dx-pl-bgrp${resaltado ? ' is-drop' : ''}`} data-puesto-id={puesto.id}>
      <div className="dx-pl-row dx-pl-bayh">
        <div className="dx-pl-lab">
          <b>{nombrePuesto(datos, puesto)}</b>
          <span>capacidad {capacidad} · {bahia?.categoria ? categoria(bahia.categoria) : 'General'}</span>
        </div>
        <div style={{ display: 'flex' }}>
          {dias.map(dia => {
            const n = ocupacionPuesto(datos, puesto.id, dia).length;
            const tono = n > capacidad ? 'var(--dx-pl-bad)' : n === capacidad ? 'var(--dx-pl-warn)' : 'var(--dx-pl-cyan)';
            return (
              <div key={dia} className={`dx-pl-oc${n > capacidad ? ' is-over' : n === capacidad ? ' is-full' : ''}`}>
                {Array.from({ length: Math.max(capacidad, n) }, (_, k) => (
                  <span key={k} className={`dx-pl-pip${k < n ? ' is-on' : ''}`} style={{ '--c': tono }} />
                ))}
                {' '}<b>{n}/{capacidad}</b>
              </div>
            );
          })}
        </div>
      </div>
      {unidades.length ? unidades.map(ocupacion => {
        const ot = ots.get(ocupacion.ot_id);
        const s = Math.max(0, dias.findIndex(dia => dia >= ocupacion.fecha_desde));
        let e = dias.length - 1;
        for (let indice = dias.length - 1; indice >= 0; indice -= 1) { if (dias[indice] <= ocupacion.fecha_hasta) { e = indice; break; } }
        const largo = e - s + 1;
        const info = modelo.infos.get(ocupacion.ot_id);
        const exceso = dias.some(dia => ocupacionPuesto(datos, puesto.id, dia).length > capacidad
          && ocupacion.fecha_desde <= dia && ocupacion.fecha_hasta >= dia);
        const editable = permiteEscritura && ot && esOtPlanificable(ot);
        const segmentos = (ot?.ot_tareas || []).map(tarea => {
          const fechas = (datos.asignaciones || []).filter(item => item.tarea_id === tarea.id && item.estado !== 'cancelado').map(item => dias.indexOf(item.fecha)).filter(item => item >= 0);
          if (!fechas.length) return null;
          const a = Math.max(Math.min(...fechas), s);
          const b = Math.min(Math.max(...fechas), e);
          const persona = (datos.personas || []).find(item => (datos.asignaciones || []).some(asig => asig.tarea_id === tarea.id && asig.tecnico_id === item.id));
          return (
            <i key={tarea.id} title={tarea.titulo} style={{ '--c': persona ? colorCargo(cargos, claveCargo(persona)) : 'var(--dx-pl-sk0)', left: `${((a - s) / largo) * 100}%`, width: `${((b - a + 1) / largo) * 100}%` }} />
          );
        });
        return (
          <div className="dx-pl-row dx-pl-lane" key={ocupacion.id}>
            <div className="dx-pl-lab"><b>{ot?.descripcion || ot?.servicio || 'Equipo'}</b><span>{numeroOT(ot)}</span></div>
            <div className="dx-pl-trk">
              <BaseCarril hoyIdx={hoyIdx} />
              <button
                type="button"
                className={`dx-pl-unit${exceso ? ' is-bad' : ''}${seleccion?.ot?.id === ocupacion.ot_id ? ' is-sel' : ''}`}
                aria-label={`${ot?.descripcion || 'Equipo'}, ${numeroOT(ot)}, en ${nombrePuesto(datos, puesto)} del ${fmtDia(ocupacion.fecha_desde)} al ${fmtDia(ocupacion.fecha_hasta)}`}
                onPointerDown={editable ? event => iniciarArrastre(event, { tipo: 'unidad', ot, puestoId: puesto.id }) : undefined}
                onClick={() => !arrastre.current && ot && onSelect({ ot })}
                style={{ ...(editable ? { touchAction: 'none' } : {}), left: `calc(${s} * var(--dw) + 3px)`, width: `calc(${largo} * var(--dw) - 6px)` }}
              >
                <small>En taller · {fmtCorto(ocupacion.fecha_desde)} – {fmtCorto(ocupacion.fecha_hasta)}</small>
                <strong>{ot?.descripcion || ot?.servicio || numeroOT(ot)}</strong>
                <span className="dx-pl-segs">{segmentos}</span>
              </button>
              {info?.st === 'bad' && <span className="dx-pl-sr">Con alerta</span>}
            </div>
          </div>
        );
      }) : (
        <div className="dx-pl-row dx-pl-lane is-vacio">
          <div className="dx-pl-lab"><b style={{ color: 'var(--dx-pl-fg3)' }}>Libre</b></div>
          <div className="dx-pl-trk">Arrastra aquí un equipo para asignarlo a este puesto</div>
        </div>
      )}
    </div>
  );
}

const CATEGORIAS = { general: 'General', pesada: 'Reparación pesada', sold: 'Soldadura', crom: 'Cromado', mec: 'Mecanizado', hidr: 'Hidráulica / banco' };
const categoria = clave => CATEGORIAS[clave] || clave;

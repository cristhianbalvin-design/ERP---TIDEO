import { useMemo, useState } from 'react';
import { edicionBloqueada, fechaEnDias } from './plannerLogic.js';
import { esOtPlanificable } from './plannerEngine.js';

const fechaLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export function BoardView({ datos, onSelect, onMoveDate, onMoveOT, undoDisponible, onUndo }) {
  const [dias, setDias] = useState(10);
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
  const ordenes = useMemo(() => new Map(datos.ots.map(ot => [ot.id, ot])), [datos.ots]);
  const fechas = Array.from({ length: dias }, (_, index) => fechaEnDias(inicio, index));
  const recursos = construirRecursos(datos);

  return (
    <section className="dx-ui-card">
      <CabeceraTablero
        inicio={inicio}
        dias={dias}
        undoDisponible={undoDisponible}
        onChangeInicio={setInicio}
        onChangeDias={setDias}
        onUndo={onUndo}
      />
      {recursos.length
        ? <GrillaRecursos
          datos={datos}
          recursos={recursos}
          fechas={fechas}
          ordenes={ordenes}
          onSelect={onSelect}
          onMoveDate={onMoveDate}
          onMoveOT={onMoveOT}
        />
        : <div className="dx-ui-empty">No hay personas ni máquinas activas para mostrar.</div>}
      {recursos.length > 0 && (
        <DestinosOT datos={datos} onMoveOT={onMoveOT} />
      )}
      <p className="dx-planner-board-hint">
        Arrastra un bloque a otro día para reprogramarlo o suéltalo sobre una OT destino
        para cambiarla. Las OT cerradas y las asignaciones no programadas no se editan.
      </p>
    </section>
  );
}

function construirRecursos(datos) {
  return [
    ...datos.personas.map(recurso => ({
      ...recurso,
      tipo: 'persona',
      asignaciones: datos.asignaciones.filter(item => item.tecnico_id === recurso.id),
      tabla: 'persona',
    })),
    ...datos.maquinas
      .filter(maquina => maquina.estado !== 'baja')
      .map(recurso => ({
        ...recurso,
        tipo: 'maquina',
        asignaciones: datos.equipos.filter(item => item.maquina_id === recurso.id),
        tabla: 'equipo',
      })),
  ];
}

function CabeceraTablero({ inicio, dias, undoDisponible, onChangeInicio, onChangeDias, onUndo }) {
  return (
    <div className="dx-ui-toolbar">
      <div>
        <h2>Tablero de recursos</h2>
        <span className="dx-ui-count">Grilla temporal por personas y máquinas</span>
      </div>
      <div className="dx-planner-board-controls">
        <label>
          Desde
          <input type="date" value={inicio} onChange={event => onChangeInicio(event.target.value)} />
        </label>
        <label>
          Rango
          <select value={dias} onChange={event => onChangeDias(Number(event.target.value))}>
            <option value="10">10 días</option>
            <option value="15">15 días</option>
            <option value="20">20 días</option>
          </select>
        </label>
        <button className="dx-btn" disabled={!undoDisponible} onClick={onUndo}>Deshacer</button>
      </div>
    </div>
  );
}

function GrillaRecursos({ datos, recursos, fechas, ordenes, onSelect, onMoveDate, onMoveOT }) {
  return (
    <div className="dx-planner-timeline" style={{ '--planner-days': fechas.length }}>
      <div className="dx-planner-time-label">Recurso / OT</div>
      {fechas.map(fecha => (
        <div className="dx-planner-time-head" key={fecha}>{fechaLabel(fecha)}</div>
      ))}
      {recursos.map(recurso => (
        <FilaRecurso
          key={`${recurso.tabla}-${recurso.id}`}
          datos={datos}
          recurso={recurso}
          fechas={fechas}
          ordenes={ordenes}
          onSelect={onSelect}
          onMoveDate={onMoveDate}
          onMoveOT={onMoveOT}
        />
      ))}
    </div>
  );
}

function FilaRecurso({ datos, recurso, fechas, ordenes, onSelect, onMoveDate, onMoveOT }) {
  const especialidad = recurso.especialidad || recurso.cargo || recurso.tipo_clave || 'Taller';
  return (
    <div className="dx-planner-time-row">
      <button
        className="dx-planner-resource"
        onClick={() => onSelect({ recurso: { ...recurso, especialidad } })}
      >
        <b>{recurso.nombre}</b>
        <small>{recurso.tipo === 'persona' ? 'Personal' : 'Máquina'} · {especialidad}</small>
      </button>
      {fechas.map(fecha => (
        <CeldaRecurso
          key={fecha}
          datos={datos}
          recurso={recurso}
          fecha={fecha}
          ordenes={ordenes}
          onSelect={onSelect}
          onMoveDate={onMoveDate}
          onMoveOT={onMoveOT}
        />
      ))}
    </div>
  );
}

function CeldaRecurso({ datos, recurso, fecha, ordenes, onSelect, onMoveDate, onMoveOT }) {
  function dropDate(event) {
    event.preventDefault();
    const movimiento = leerMovimiento(event);
    if (movimiento) onMoveDate(movimiento, fecha);
  }
  return (
    <div
      className="dx-planner-time-cell"
      data-target-day={fecha}
      onDragOver={event => event.preventDefault()}
      onDrop={dropDate}
    >
      {recurso.asignaciones
        .filter(asignacion => asignacion.fecha === fecha)
        .map(asignacion => (
          <BloqueAsignacion
            key={asignacion.id}
            asignacion={asignacion}
            ordenes={ordenes}
            tabla={recurso.tabla}
            onSelect={onSelect}
            onMoveOT={onMoveOT}
          />
        ))}
    </div>
  );
}

function BloqueAsignacion({ datos, asignacion, ordenes, tabla, onSelect, onMoveOT }) {
  const ot = ordenes.get(asignacion.ot_id);
  const bloqueada = edicionBloqueada(ot, asignacion);
  const movimiento = {
    tabla,
    id: asignacion.id,
    otId: asignacion.ot_id,
    estado: asignacion.estado,
    ot,
    tareaId: asignacion.tarea_id,
    fecha: asignacion.fecha,
  };
  function startDrag(event) {
    event.dataTransfer.setData('application/json', JSON.stringify(movimiento));
    event.dataTransfer.effectAllowed = 'move';
  }
  function changeOT(event) {
    if (event.target.value) onMoveOT(movimiento, event.target.value);
  }
  return (
    <div
      className={`dx-planner-block ${bloqueada ? 'is-locked' : ''}`}
      draggable={!bloqueada}
      title={bloqueada ? 'OT cerrada o asignación bloqueada' : 'Arrastra a otro día u OT'}
      onDragStart={startDrag}
    >
      <button onClick={() => onSelect({ ot })}>
        <b>OT {ot?.numero || asignacion.ot_id}</b>
        <small>{asignacion.horas_estimadas || 8} h · {bloqueada ? 'Bloqueada' : 'Programada'}</small>
      </button>
      <select
        aria-label="Mover asignación a otra OT"
        disabled={bloqueada}
        value=""
        onChange={changeOT}
      >
        <option value="">Mover a OT…</option>
        {datos.ots.filter(item => item.id !== asignacion.ot_id && esOtPlanificable(item))
          .map(item => (
            <option key={item.id} value={item.id}>OT {item.numero || item.id}</option>
          ))}
      </select>
    </div>
  );
}

function DestinosOT({ datos, onMoveOT }) {
  return (
    <div className="dx-planner-ot-drop">
      <b>OT destino</b>
      {datos.ots.filter(esOtPlanificable).map(ot => (
        <button
          key={ot.id}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            event.stopPropagation();
            const movimiento = leerMovimiento(event);
            if (movimiento && movimiento.otId !== ot.id) onMoveOT(movimiento, ot.id);
          }}
        >
          <b>OT {ot.numero || ot.id}</b>
          <small>{ot.descripcion || ot.servicio || 'Soltar para reasignar'}</small>
        </button>
      ))}
    </div>
  );
}

function leerMovimiento(event) {
  const raw = event.dataTransfer.getData('application/json');
  return raw ? JSON.parse(raw) : null;
}

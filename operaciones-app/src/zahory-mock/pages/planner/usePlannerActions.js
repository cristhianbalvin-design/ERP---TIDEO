import { useEffect } from 'react';
import {
  asignarEquipo,
  asignarPersona,
  actualizarAsignacion,
  actualizarFechaAsignacion,
  cambiarPuestoOT,
  heredarTareasOT,
  mensajeErrorPlanner,
  moverAsignacion,
  moverAsignacionEquipo,
  restaurarTareaAsignacion,
  sincronizarOcupacionesOT,
} from '../../../services/plannerService.js';
import { validarCapacidadPuesto, validarOtPlanificable } from './plannerEngine.js';
import { puestoDeOT, sumarHabiles } from './plannerModelo.js';
import { crearAccionGuardarConfig, crearAccionGuardarTaller } from './plannerConfigActions.js';
import { crearAccionesSimulacion } from './plannerSimulationActions.js';

export function usePlannerActions({
  sesion,
  aviso,
  datos,
  ots,
  recursos,
  undo,
  seleccion,
  simulacion,
  cargar,
  setGuardando,
  setError,
  setAviso,
  setUndo,
  setWizard,
  setVista,
  setSeleccion,
  setSimulacion,
}) {
  useEffect(() => {
    if (!aviso) return undefined;
    const timer = setTimeout(() => setAviso(''), 5000);
    return () => clearTimeout(timer);
  }, [aviso, setAviso]);

  async function ejecutar(accion, mensaje) {
    setGuardando(true);
    setError('');
    setAviso('');
    if (!sesion.permiteEscritura) {
      setError(
        'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
      );
      setGuardando(false);
      return false;
    }
    try {
      await accion();
      if (mensaje) setAviso(mensaje);
      await cargar();
      return true;
    } catch (accionError) {
      const mensajeError = mensajeErrorPlanner(accionError);
      await cargar(false);
      setError(mensajeError);
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const guardarConfig = crearAccionGuardarConfig({ sesion, ejecutar });
  const guardarTaller = crearAccionGuardarTaller({ sesion, ejecutar, onGuardado: () => setVista('panel') });
  const accionesSimulacion = crearAccionesSimulacion({
    datos,
    ots,
    recursos,
    seleccion,
    simulacion,
    ejecutar,
    setError,
    setSimulacion,
    setVista,
    setSeleccion,
    setWizard,
    setUndo,
  });

  function abrirWizard(ot) {
    setAviso('');
    setSeleccion(ot ? { ot } : {});
    setWizard({ ot });
  }

  function cambiarVista(nuevaVista) {
    setAviso('');
    setError('');
    setVista(nuevaVista);
  }

  function simular() {
    setAviso('');
    accionesSimulacion.simular();
  }

  async function guardarWizard({ ot, taskPlans }) {
    try {
      const guardado = await ejecutar(async () => {
        validarOtPlanificable(ot);
        const tareasActivas = taskPlans.filter(plan => plan.horasPendientes > 0);
        if (!tareasActivas.length) {
          throw new Error('La OT no tiene horas pendientes estimadas para programar.');
        }
        for (const plan of tareasActivas) {
          const { personaIds = [], maquinaIds = [] } = plan.assignment;
          if (!personaIds.length && !maquinaIds.length) {
            throw new Error(
              `Elige al menos una persona o máquina para ${plan.tarea.titulo || 'cada tarea'}.`,
            );
          }
        }
        for (const plan of tareasActivas) await guardarAsignacionesTarea(ot, plan);
        await sincronizarOcupacionesOT({ otId: ot.id });
      }, 'La planificación quedó guardada.');
      if (guardado) {
        setWizard(null);
        setVista('panel');
      }
      return guardado;
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
      return false;
    }
  }

  async function guardarAsignacionesTarea(ot, plan) {
    const { tarea, assignment } = plan;
    for (const fechaPlan of plan.p50.fechas) {
      for (const tecnicoId of assignment.personaIds || []) {
        await asignarPersona({
          empresaId: sesion.empresaId,
          sociedadId: sesion.sociedadId,
          ot,
          tecnicoId,
          puestoId: assignment.puestoId || null,
          tareaId: tarea.id,
          fecha: fechaPlan.fecha,
          horas: Math.min(assignment.horasPersona || 8, fechaPlan.horas),
        });
      }
      for (const maquinaId of assignment.maquinaIds || []) {
        await asignarEquipo({
          empresaId: sesion.empresaId,
          sociedadId: sesion.sociedadId,
          ot,
          maquinaId,
          tareaId: tarea.id,
          fecha: fechaPlan.fecha,
          horas: Math.min(assignment.horasMaquina || 8, fechaPlan.horas),
        });
      }
    }
  }

  async function moverFecha(asignacion, fechaDestino) {
    try {
      return await ejecutar(async () => {
        if (asignacion.estado !== 'programado' || !asignacion.ot) {
          throw new Error('Esta asignación no está programada y no se puede mover.');
        }
        validarOtPlanificable(asignacion.ot);
        await actualizarFechaAsignacion({
          tabla: nombreTabla(asignacion.tabla),
          id: asignacion.id,
          fecha: fechaDestino,
        });
        setUndo({
          kind: 'date',
          ...asignacion,
          fecha: asignacion.fecha,
          newDate: fechaDestino,
        });
      }, 'La asignación se movió al nuevo día.');
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
      return false;
    }
  }

  async function moverOT(asignacion, destino) {
    try {
      return await ejecutar(async () => {
        const original = datos.ots.find(ot => ot.id === asignacion.otId);
        const nueva = datos.ots.find(ot => ot.id === destino);
        validarOtPlanificable(original);
        validarOtPlanificable(nueva);
        const args = {
          asignacionId: asignacion.id,
          otDestino: destino,
          motivo: `Movida desde OT ${asignacion.otId} en Planner`,
        };
        if (asignacion.tabla === 'equipo') await moverAsignacionEquipo(args);
        else await moverAsignacion(args);
        await sincronizarOcupacionesOT({ otId: asignacion.otId });
        await sincronizarOcupacionesOT({ otId: destino });
        setUndo({ kind: 'ot', ...asignacion, oldOT: asignacion.otId, newOT: destino });
      }, 'La asignación se movió a la OT seleccionada.');
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
      return false;
    }
  }

  async function deshacer() {
    try {
      if (!undo) return;
      return await ejecutar(async () => {
        if (undo.kind === 'ot') await deshacerMovimientoOT(undo);
        else if (undo.kind === 'lote') await deshacerLote(undo);
        else if (undo.kind === 'puesto') {
          if (undo.puestoAnterior) await cambiarPuestoOT({ otId: undo.otId, puestoId: undo.puestoAnterior });
        } else {
          await actualizarFechaAsignacion({
            tabla: nombreTabla(undo.tabla),
            id: undo.id,
            fecha: undo.fecha,
          });
        }
        setUndo(null);
      }, 'Se deshizo el último movimiento.');
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
      return false;
    }
  }

  async function deshacerMovimientoOT(item) {
    const args = {
      asignacionId: item.id,
      otDestino: item.oldOT,
      motivo: 'Deshacer movimiento desde Planner',
    };
    if (item.tabla === 'equipo') await moverAsignacionEquipo(args);
    else await moverAsignacion(args);
    await restaurarTareaAsignacion({
      tabla: nombreTabla(item.tabla),
      id: item.id,
      tareaId: item.tareaId,
    });
    await sincronizarOcupacionesOT({ otId: item.newOT });
    await sincronizarOcupacionesOT({ otId: item.oldOT });
  }

  // Mueve un grupo de asignaciones: cambia su recurso (técnico o máquina) y/o las corre «delta» días hábiles.
  async function moverLote({ items, delta = 0, recursoDestino = null }, mensaje) {
    try {
      return await ejecutar(async () => {
        if (!items?.length) throw new Error('No hay asignaciones programadas para mover.');
        for (const { asignacion } of items) {
          if (asignacion.estado !== 'programado') {
            throw new Error('Solo se pueden mover asignaciones programadas.');
          }
          validarOtPlanificable(datos.ots.find(ot => ot.id === asignacion.ot_id));
        }
        const destinos = items.map(item => ({
          ...item,
          recursoFinal: item.recurso || recursoDestino || null,
          fechaFinal: item.fecha || (delta ? sumarHabiles(item.asignacion.fecha, delta) : null),
        }));
        const ordenados = [
          ...destinos.filter(item => item.fechaFinal && item.fechaFinal < item.asignacion.fecha)
            .sort((a, b) => a.fechaFinal.localeCompare(b.fechaFinal)),
          ...destinos.filter(item => !(item.fechaFinal && item.fechaFinal < item.asignacion.fecha))
            .sort((a, b) => b.asignacion.fecha.localeCompare(a.asignacion.fecha)),
        ];
        for (const item of ordenados) {
          const actual = item.tabla === 'equipo' ? item.asignacion.maquina_id : item.asignacion.tecnico_id;
          const recurso = item.recursoFinal && item.recursoFinal !== actual ? item.recursoFinal : null;
          const fecha = item.fechaFinal && item.fechaFinal !== item.asignacion.fecha ? item.fechaFinal : null;
          if (recurso || fecha) await actualizarAsignacion({ tabla: item.tabla, id: item.asignacion.id, recurso, fecha });
        }
        for (const otId of new Set(items.map(item => item.asignacion.ot_id))) await sincronizarOcupacionesOT({ otId });
        setUndo({
          kind: 'lote',
          items: items.map(item => ({
            tabla: item.tabla,
            id: item.asignacion.id,
            fecha: item.asignacion.fecha,
            recurso: item.tabla === 'equipo' ? item.asignacion.maquina_id : item.asignacion.tecnico_id,
            otId: item.asignacion.ot_id,
            actual: destinos.find(destino => destino.asignacion.id === item.asignacion.id)?.fechaFinal || item.asignacion.fecha,
          })),
        });
      }, mensaje);
    } catch {
      return false;
    }
  }

  function aplicarLote(items, mensaje) {
    return moverLote({ items }, mensaje);
  }

  async function deshacerLote(item) {
    // Primero las que vuelven hacia atrás (de la más temprana a la más tardía) y luego las que avanzan
    // (de la más tardía a la más temprana), para no pisar a otra asignación del mismo técnico.
    const atras = item.items.filter(fila => fila.actual && fila.fecha < fila.actual).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const resto = item.items.filter(fila => !atras.includes(fila)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    for (const fila of [...atras, ...resto]) {
      await actualizarAsignacion({ tabla: fila.tabla, id: fila.id, recurso: fila.recurso, fecha: fila.fecha });
    }
    for (const otId of new Set(item.items.map(fila => fila.otId))) await sincronizarOcupacionesOT({ otId });
  }

  const comoItems = (asignaciones, tabla) => asignaciones.map(asignacion => ({
    tabla: tabla || (asignacion.maquina_id ? 'equipo' : 'persona'),
    asignacion,
  }));

  function moverBloque({ tabla, asignaciones, delta, recursoDestino }) {
    return moverLote(
      { items: comoItems(asignaciones, tabla), delta, recursoDestino },
      recursoDestino ? 'El bloque cambió de responsable.' : 'El bloque se movió a la nueva fecha.',
    );
  }

  function cambiarResponsable(asignaciones, tecnicoId) {
    return moverLote({ items: comoItems(asignaciones, 'persona'), recursoDestino: tecnicoId }, 'La tarea cambió de responsable.');
  }

  function cambiarMaquina(asignaciones, maquinaId) {
    return moverLote({ items: comoItems(asignaciones, 'equipo'), recursoDestino: maquinaId }, 'La tarea cambió de máquina.');
  }

  function noEmpezarAntes(asignaciones, delta) {
    return moverLote({ items: comoItems(asignaciones), delta }, 'La tarea se movió a la nueva fecha de inicio.');
  }

  async function cambiarPuesto(ot, puestoId) {
    try {
      return await ejecutar(async () => {
        validarOtPlanificable(ot);
        const anterior = puestoDeOT(datos, ot.id);
        const puesto = datos.puestos.find(item => item.id === puestoId);
        const fechas = [...datos.asignaciones, ...datos.equipos]
          .filter(item => item.ot_id === ot.id && item.estado === 'programado').map(item => item.fecha).sort();
        if (!fechas.length) throw new Error('Planifica la OT antes de elegir su puesto.');
        const capacidad = validarCapacidadPuesto(datos.ocupaciones, puestoId, fechas[0], fechas.at(-1), puesto?.capacidad || 1, ot.id);
        if (!capacidad.valido) {
          throw new Error(`El puesto no tiene capacidad disponible el ${capacidad.fecha}. Ajusta la planificación.`);
        }
        await cambiarPuestoOT({ otId: ot.id, puestoId });
        setUndo({ kind: 'puesto', otId: ot.id, puestoAnterior: anterior?.id || null });
      }, 'El equipo cambió de puesto.');
    } catch {
      return false;
    }
  }

  async function guardarWizardHerencia(otId) {
    return ejecutar(() => heredarTareasOT(otId), 'Se heredaron las tareas de la OT.');
  }

  return {
    abrirWizard,
    cambiarVista,
    guardarWizard,
    guardarConfig,
    guardarTaller,
    moverFecha,
    moverOT,
    deshacer,
    simular,
    moverBloque,
    cambiarResponsable,
    cambiarMaquina,
    noEmpezarAntes,
    cambiarPuesto,
    aplicarLote,
    elegirUrgente: accionesSimulacion.elegirUrgente,
    aplicarSimulacion: accionesSimulacion.aplicarSimulacion,
    guardarWizardHerencia,
  };
}

function nombreTabla(tabla) {
  return tabla === 'equipo' ? 'planner_asignaciones_equipo' : 'planner_asignaciones';
}

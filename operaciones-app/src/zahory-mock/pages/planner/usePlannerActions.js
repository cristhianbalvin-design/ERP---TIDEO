import {
  asignarEquipo,
  asignarPersona,
  actualizarFechaAsignacion,
  heredarTareasOT,
  mensajeErrorPlanner,
  moverAsignacion,
  moverAsignacionEquipo,
  restaurarTareaAsignacion,
  sincronizarOcupacionesOT,
} from '../../../services/plannerService.js';
import { validarOtPlanificable } from './plannerEngine.js';
import { crearAccionGuardarConfig } from './plannerConfigActions.js';
import { crearAccionesSimulacion } from './plannerSimulationActions.js';

export function usePlannerActions({
  sesion,
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
  async function ejecutar(accion, mensaje) {
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      if (!sesion.permiteEscritura) {
        throw new Error('Selecciona una sociedad activa con permiso de escritura para planificar.');
      }
      await accion();
      if (mensaje) setAviso(mensaje);
      await cargar();
    } catch (accionError) {
      const mensajeError = mensajeErrorPlanner(accionError);
      await cargar(false);
      setError(mensajeError);
      throw accionError;
    } finally {
      setGuardando(false);
    }
  }

  const guardarConfig = crearAccionGuardarConfig({ sesion, ejecutar });
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
  });

  function abrirWizard(ot) {
    setSeleccion(ot ? { ot } : {});
    setWizard({ ot });
  }

  async function guardarWizard({ ot, taskPlans }) {
    try {
      await ejecutar(async () => {
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
      setWizard(null);
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
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
      await ejecutar(async () => {
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
    }
  }

  async function moverOT(asignacion, destino) {
    try {
      await ejecutar(async () => {
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
    }
  }

  async function deshacer() {
    try {
      if (!undo) return;
      await ejecutar(async () => {
        if (undo.kind === 'ot') await deshacerMovimientoOT(undo);
        else {
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

  async function guardarWizardHerencia(otId) {
    await ejecutar(() => heredarTareasOT(otId), 'Se heredaron las tareas de la OT.');
  }

  return {
    abrirWizard,
    guardarWizard,
    guardarConfig,
    moverFecha,
    moverOT,
    deshacer,
    simular: accionesSimulacion.simular,
    aplicarSimulacion: accionesSimulacion.aplicarSimulacion,
    guardarWizardHerencia,
  };
}

function nombreTabla(tabla) {
  return tabla === 'equipo' ? 'planner_asignaciones_equipo' : 'planner_asignaciones';
}

import {
  actualizarFechaAsignacion,
  mensajeErrorPlanner,
  sincronizarOcupacionesOT,
} from '../../../services/plannerService.js';
import { simularUrgencia, validarOtPlanificable } from './plannerEngine.js';
import { sumarHabiles } from './plannerModelo.js';

export function crearAccionesSimulacion({
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
  setUndo = () => {},
}) {
  function simular() {
    if (simulacion) {
      setSimulacion(null);
      return;
    }
    const urgente = seleccion?.ot;
    if (!urgente) {
      setSimulacion({ elegir: true });
      return;
    }
    elegirUrgente(urgente);
  }

  function elegirUrgente(urgente) {
    try {
      validarOtPlanificable(urgente);
      const resultado = simularUrgencia(ots, urgente, {
        horasPersonaDisponibles: recursos.personas * 8,
        horasMaquinaDisponibles: recursos.maquinas * 8,
      }, new Date(), datos);
      setSimulacion({ urgente, resultado });
    } catch (error) {
      setError(mensajeErrorPlanner(error));
    }
  }

  async function aplicarSimulacion() {
    if (!simulacion?.urgente) return;
    const urgente = simulacion.urgente;
    try {
      const aplicada = await ejecutar(async () => {
        const dias = Math.max(1, simulacion.resultado.esperaDias);
        const asignaciones = [
          ...(datos.asignaciones || []).map(item => ({ ...item, tabla: 'planner_asignaciones', clase: 'persona' })),
          ...(datos.equipos || []).map(item => ({
            ...item,
            tabla: 'planner_asignaciones_equipo',
            clase: 'equipo',
          })),
        ].filter(item => item.ot_id !== urgente.id && item.estado === 'programado')
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const movidas = [];
        for (const asignacion of asignaciones) {
          await actualizarFechaAsignacion({
            tabla: asignacion.tabla,
            id: asignacion.id,
            fecha: sumarHabiles(asignacion.fecha, dias),
          });
          movidas.push(asignacion);
        }
        for (const ot of ots) await sincronizarOcupacionesOT({ otId: ot.id });
        setUndo({
          kind: 'lote',
          items: movidas.map(item => ({
            tabla: item.clase,
            id: item.id,
            fecha: item.fecha,
            recurso: item.clase === 'equipo' ? item.maquina_id : item.tecnico_id,
            otId: item.ot_id,
            actual: sumarHabiles(item.fecha, dias),
          })),
        });
      }, 'El plan se ajustó para dar prioridad al trabajo urgente.');
      if (aplicada) {
        // Si la OT urgente ya tiene plan, se muestra en el Tablero; si no, se abre el asistente para planificarla.
        const planificada = (datos.asignaciones || []).some(item => item.ot_id === urgente.id && item.estado !== 'cancelado');
        setVista(planificada ? 'tablero' : 'panel');
        setSeleccion({ ot: urgente });
        if (!planificada) setWizard({ ot: urgente });
        setSimulacion(null);
      }
      return aplicada;
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
      return false;
    }
  }

  return { simular, elegirUrgente, aplicarSimulacion };
}

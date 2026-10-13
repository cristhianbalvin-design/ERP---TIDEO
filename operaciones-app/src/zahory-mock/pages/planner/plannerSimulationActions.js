import {
  actualizarFechaAsignacion,
  mensajeErrorPlanner,
  sincronizarOcupacionesOT,
} from '../../../services/plannerService.js';
import { simularUrgencia, validarOtPlanificable } from './plannerEngine.js';
import { fechaEnDias } from './plannerLogic.js';

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
}) {
  function simular() {
    const urgente = seleccion?.ot;
    if (!urgente) {
      setError('Selecciona una OT en Plan por OS para simular el impacto urgente.');
      return;
    }
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
    if (!simulacion) return;
    const urgente = simulacion.urgente;
    try {
      await ejecutar(async () => {
        const dias = Math.max(1, simulacion.resultado.esperaDias);
        const asignaciones = [
          ...(datos.asignaciones || []).map(item => ({ ...item, tabla: 'planner_asignaciones' })),
          ...(datos.equipos || []).map(item => ({
            ...item,
            tabla: 'planner_asignaciones_equipo',
          })),
        ].filter(item => item.ot_id !== urgente.id && item.estado === 'programado');
        for (const asignacion of asignaciones) {
          await actualizarFechaAsignacion({
            tabla: asignacion.tabla,
            id: asignacion.id,
            fecha: fechaEnDias(asignacion.fecha, dias),
          });
        }
        for (const ot of ots) await sincronizarOcupacionesOT({ otId: ot.id });
      }, 'El plan se ajustó para dar prioridad al trabajo urgente.');
      setVista('panel');
      setSeleccion({ ot: urgente });
      setWizard({ ot: urgente });
      setSimulacion(null);
    } catch {
      // ejecutar muestra el error y recarga los datos del tablero.
    }
  }

  return { simular, aplicarSimulacion };
}

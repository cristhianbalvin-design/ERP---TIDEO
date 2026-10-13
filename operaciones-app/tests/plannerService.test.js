import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../src/lib/supabaseClient.js', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

const { actualizarFechaAsignacion, mensajeErrorPlanner, sincronizarOcupacionesOT } =
  await import('../src/services/plannerService.js');

describe('RPC transaccionales del Planner', () => {
  beforeEach(() => rpc.mockReset());

  it('sincroniza ocupaciones de OT mediante RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await sincronizarOcupacionesOT({ otId: 'OT-1' });
    expect(rpc).toHaveBeenCalledWith('planner_sincronizar_ocupaciones_ot', {
      p_ot_id: 'OT-1',
    });
  });

  it('mueve una asignación de equipo mediante el RPC atómico', async () => {
    const asignacion = { id: 'eq-1', fecha: '2026-10-14' };
    rpc.mockResolvedValue({ data: asignacion, error: null });
    await expect(actualizarFechaAsignacion({
      tabla: 'planner_asignaciones_equipo',
      id: 'eq-1',
      fecha: '2026-10-14',
    })).resolves.toEqual(asignacion);
    expect(rpc).toHaveBeenCalledWith('planner_mover_fecha_asignacion', {
      p_tabla: 'planner_asignaciones_equipo',
      p_id: 'eq-1',
      p_fecha: '2026-10-14',
    });
  });

  it('traduce errores de capacidad a un mensaje accionable en español', async () => {
    const error = { message: 'El puesto supera su capacidad el 2026-10-14' };
    expect(mensajeErrorPlanner(error)).toBe(
      'El puesto no tiene capacidad disponible el 2026-10-14. Ajusta la planificación.',
    );
    rpc.mockResolvedValue({ data: null, error });
    await expect(actualizarFechaAsignacion({
      id: 'as-1',
      fecha: '2026-10-14',
    })).rejects.toThrow('El puesto no tiene capacidad disponible el 2026-10-14');
  });
});

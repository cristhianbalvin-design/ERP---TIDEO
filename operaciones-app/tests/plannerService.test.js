import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, insert, update, eq, select, single } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('../src/lib/supabaseClient.js', () => ({
  getSupabaseClient: () => ({ rpc, from }),
}));

const { actualizarFechaAsignacion, guardarBahia, guardarPuesto, mensajeErrorPlanner,
  sincronizarOcupacionesOT, cargarPlanner } =
  await import('../src/services/plannerService.js');

describe('RPC transaccionales del Planner', () => {
  beforeEach(() => {
    [rpc, from, insert, update, eq, select, single].forEach(mock => mock.mockReset());
    const query = { insert, update, eq, select, single };
    from.mockReturnValue(query);
    [insert, update, eq, select].forEach(mock => mock.mockReturnValue(query));
  });

  it('solo envía columnas snake_case al guardar un puesto', async () => {
    single.mockResolvedValue({ data: { id: 'P-1' }, error: null });
    await guardarPuesto({
      empresaId: 'E-1',
      sociedadId: 'S-1',
      id: null,
      bahia_id: 'B-1',
      codigo: 'P1',
      nombre: 'Puesto 1',
      capacidad: 2,
      orden: 0,
    });
    expect(insert).toHaveBeenCalledWith({
      bahia_id: 'B-1',
      codigo: 'P1',
      nombre: 'Puesto 1',
      capacidad: 2,
      orden: 0,
      activo: undefined,
      empresa_id: 'E-1',
    });
    expect(Object.keys(insert.mock.calls[0][0]).every(key => /^[a-z][a-z0-9_]*$/.test(key)))
      .toBe(true);
    await guardarPuesto({
      empresaId: 'E-1',
      sociedadId: 'S-1',
      id: 'P-1',
      bahia_id: 'B-2',
      codigo: 'P2',
      nombre: 'Puesto 2',
      capacidad: 3,
    });
    expect(update.mock.calls[0][0]).not.toHaveProperty('sociedadId');
    expect(Object.keys(update.mock.calls[0][0]).every(key => /^[a-z][a-z0-9_]*$/.test(key)))
      .toBe(true);
  });

  it.each([
    ['mec', 'Mecanizado'],
    ['sold', 'Soldadura'],
  ])('persiste y lee la categoría %s de una bahía', async (categoria, nombre) => {
    const bahia = { id: 'B-1', categoria };
    single.mockResolvedValue({ data: bahia, error: null });
    await expect(guardarBahia({
      empresaId: 'E-1',
      sociedadId: 'S-1',
      codigo: `B-${categoria}`,
      nombre,
      categoria,
      orden: 0,
    })).resolves.toEqual(bahia);
    expect(insert.mock.calls[0][0].categoria).toBe(categoria);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('categoria'));
    expect(single).toHaveBeenCalledOnce();
  });

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

describe('nombres de demanda del Planner', () => {
  it('resuelve actividad y cargo con catálogos de la empresa', async () => {
    const filas = {
      ordenes_trabajo: [{
        id: 'OT-1',
        ot_tareas: [{
          id: 'T-1', familia_trabajo_id: 'F-1', actividad_id: 'A-1', cargo_id: 'C-1',
        }],
      }],
      familia_trabajo: [{ id: 'F-1', nombre: 'Mecánica' }],
      tipos_servicio_interno: [{ id: 'A-1', nombre: 'Inspección' }],
      cargos_empresa: [{ id: 'C-1', nombre: 'Técnico mecánico' }],
    };
    const consultas = [];
    from.mockImplementation(tabla => {
      const consulta = {
        select: vi.fn(() => consulta),
        eq: vi.fn(() => consulta),
        in: vi.fn(() => consulta),
        order: vi.fn(() => consulta),
        neq: vi.fn(() => consulta),
        then: (resolve, reject) => Promise.resolve({
          data: filas[tabla] || [], error: null,
        }).then(resolve, reject),
      };
      consultas.push({ tabla, consulta });
      return consulta;
    });

    const datos = await cargarPlanner({ empresaId: 'E-1' });
    expect(datos.ots[0].ot_tareas[0]).toMatchObject({
      familia_trabajo: { nombre: 'Mecánica' },
      actividad: { nombre: 'Inspección' },
      cargo: { nombre: 'Técnico mecánico' },
    });
    ['tipos_servicio_interno', 'cargos_empresa'].forEach(tabla => {
      const consulta = consultas.find(item => item.tabla === tabla).consulta;
      expect(consulta.eq).toHaveBeenCalledWith('empresa_id', 'E-1');
    });
  });
});

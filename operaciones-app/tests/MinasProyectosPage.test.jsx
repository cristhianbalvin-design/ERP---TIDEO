import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', estado: 'listo', permiteEscritura: false }, rpc: vi.fn(), listar: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/minasService.js', () => ({ listarMinas: mocks.listar, guardarMina: vi.fn(), guardarProyectoMina: vi.fn(), asignarAlmacenMina: vi.fn(), crearAlmacenPeriferico: vi.fn() }));
import { MinasProyectosPage } from '../src/zahory-mock/pages/MinasProyectosPage.jsx';

describe('MinasProyectosPage', () => {
  beforeEach(() => {
    mocks.sesion = { empresaId: 'e1', estado: 'listo', permiteEscritura: false };
    mocks.rpc.mockImplementation((_nombre, params) => Promise.resolve({ data: params.target_accion === 'ver', error: null }));
    mocks.listar.mockResolvedValue({ minas: [{ id: 'm1', codigo: 'M1', nombre: 'Mina Norte', estado: 'activo', cuenta_id: 'c1', cuenta_nombre: 'Cliente A', proyectos: [{ id: 'p1', codigo: 'P1', nombre: 'Proyecto uno', estado: 'activo' }], almacenes: [{ id: 'a1', codigo: 'A1', nombre: 'Periférico', materiales: 4, unidades: 9 }] }], proyectos_sin_mina: [], almacenes_centrales: [], cuentas: [] });
  });
  it('carga y renderiza mina, proyecto y almacén; no presenta acciones de escritura sin permiso', async () => {
    let root;
    await act(async () => { root = TestRenderer.create(<MinasProyectosPage />); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.rpc).toHaveBeenCalledWith('usuario_puede', { target_empresa_id: 'e1', target_pantalla: 'inventario', target_accion: 'ver' });
    expect(root.root.findByType('h1').children.join('')).toBe('Minas y proyectos');
    expect(root.root.findAll(node => node.children?.join('').includes('Proyecto uno'))).toHaveLength(1);
    expect(root.root.findAll(node => node.children?.join('').includes('A1 · Periférico')).length).toBeGreaterThan(0);
    expect(root.root.findAllByType('button').some(button => button.children.join('').includes('Nueva mina'))).toBe(false);
  });
});

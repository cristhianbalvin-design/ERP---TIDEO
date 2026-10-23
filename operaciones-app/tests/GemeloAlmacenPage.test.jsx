import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'emp-1', estado: 'listo', cargando: false, permiteEscritura: true, sociedadId: 'soc-1', vistaConsolidada: false, sociedadesIdsAlcance: ['soc-1'] },
  rpc: vi.fn(), listar: vi.fn(), cargar: vi.fn(), guardar: vi.fn(),
}));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../src/services/gemeloAlmacenService.js', () => ({ listarAlmacenesGemelo: mocks.listar, cargarGemelo: mocks.cargar, guardarPlanoAlmacen: mocks.guardar }));
import { GemeloAlmacenPage } from '../src/zahory-mock/pages/gemelo/GemeloAlmacenPage.jsx';
import { PLANO_EJEMPLO } from '../src/zahory-mock/pages/gemelo/gemeloEjemplo.js';

const texto = node => (Array.isArray(node.children) ? node.children.map(c => (typeof c === 'string' ? c : texto(c))).join('') : '');
const boton = (root, t) => root.root.findAllByType('button').find(b => texto(b).includes(t));
async function render() { let root; await act(async () => { root = TestRenderer.create(<GemeloAlmacenPage />); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); }); return root; }

const mat = { codigo: 'QUI-LUB-044', descripcion: 'Grasa de litio', unidad: 'UND', costo_promedio: 22, punto_reorden: 0 };

describe('GemeloAlmacenPage', () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
    mocks.listar.mockReset().mockResolvedValue([{ id: 'alm-1', codigo: 'ALM-001', nombre: 'Almacén Principal', clase: 'central', plano: null }]);
    mocks.cargar.mockReset().mockResolvedValue({ plano: null, ubicaciones: [], stock: [], ultimos: [], movimientos: [] });
    mocks.guardar.mockReset().mockResolvedValue({ version: 1, creadas: 113, actualizadas: 0, desactivadas: 0 });
  });

  it('sin plano ofrece dibujarlo o ver el ejemplo', async () => {
    const root = await render();
    expect(mocks.cargar).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'emp-1', almacenId: 'alm-1', sociedadId: 'soc-1' }));
    expect(texto(root.root)).toContain('Este almacén todavía no tiene plano.');
    expect(boton(root, 'Dibujar el plano')).toBeTruthy();
  });

  it('con plano muestra resumen, busca material y abre el detalle de la posición', async () => {
    mocks.cargar.mockResolvedValue({
      plano: { layout: PLANO_EJEMPLO, version: 3 },
      ubicaciones: [{ id: 'u1', codigo: 'A-01-1', uso: 'almacenaje' }, { id: 'g', codigo: 'GEN', es_general: true }],
      stock: [{ material_id: 'm1', ubicacion_id: 'u1', fisico: 60, reservado: 0, materiales: mat }, { material_id: 'm1', ubicacion_id: 'g', fisico: 3, reservado: 0, materiales: mat }],
      ultimos: [], movimientos: [],
    });
    const root = await render();
    const t = texto(root.root);
    expect(t).toContain('104posiciones');
    expect(t).toContain('ocupación (1)');
    expect(t).toContain('ubicaciones fuera del plano: General');
    const input = root.root.find(n => n.type === 'input' && n.props['aria-label'] === 'Buscar material');
    await act(async () => { input.props.onChange({ target: { value: 'grasa' } }); });
    expect(texto(root.root)).toContain('1 posición(es) resaltadas en el 3D');
    await act(async () => { root.root.findAll(n => n.type === 'button' && texto(n).includes('A-01-1'))[0].props.onClick(); });
    expect(texto(root.root)).toContain('Rack A · módulo 1 · nivel 1');
    expect(texto(root.root)).toContain('Ruta desde la puerta');
  });

  it('el editor guarda el plano con la versión vigente', async () => {
    mocks.cargar.mockResolvedValue({ plano: { layout: PLANO_EJEMPLO, version: 3 }, ubicaciones: [], stock: [], ultimos: [], movimientos: [] });
    const root = await render();
    await act(async () => { boton(root, 'Editor de plano').props.onClick(); });
    expect(texto(root.root)).toContain('Plano del almacén');
    const guardar = boton(root, 'Guardar y generar ubicaciones');
    expect(guardar.props.disabled).toBe(true);
    const ancho = root.root.find(n => n.type === 'input' && n.props.id === 'gem-an');
    await act(async () => { ancho.props.onChange({ target: { value: '32' } }); });
    await act(async () => { root.root.find(n => n.type === 'input' && n.props.id === 'gem-an').props.onBlur(); });
    expect(texto(root.root)).toMatch(/32[.,]0 × 20[.,]0 m/);
    await act(async () => { await boton(root, 'Guardar y generar ubicaciones').props.onClick(); });
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'emp-1', almacenId: 'alm-1', version: 3, layout: expect.objectContaining({ ancho: 32 }) }));
  });

  it('sin permiso de ver no carga datos', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const root = await render();
    expect(texto(root.root)).toContain('No tienes permiso para ver el inventario.');
    expect(mocks.cargar).not.toHaveBeenCalled();
  });
});

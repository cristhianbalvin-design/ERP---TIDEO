import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { datosEntrega, estadoInicialEntrega, finGarantia, validarPasoEntrega } from '../src/zahory-mock/pages/of/ofEntregaLogic.js';

const mocks = vi.hoisted(() => ({ estado: 'lista_entrega', permiso: true }));
vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => ({ estado: 'listo', empresaId: 'e1' }) }));
vi.mock('../src/useCompactWorkMode.js', () => ({ useCompactWorkMode: () => {} }));
vi.mock('../src/services/ofEntregaService.js', () => ({ cargarDatosEntrega: () => Promise.resolve({ puede_entregar: mocks.permiso }), cargarEntrega: () => Promise.resolve({ entrega: null, unidades: [] }), entregarOF: vi.fn(), subirFotoEntrega: vi.fn(), subirFirmaEntrega: vi.fn(), registrarPdfEntrega: vi.fn(), urlsFirmadasEntrega: vi.fn() }));
vi.mock('../src/services/ordenFabricacionService.js', () => ({
  obtenerOF: () => Promise.resolve({ id: 'of1', numero: 'OF-1', estado: mocks.estado, operaciones: [], materiales: [], avance_pct: 0, costo_estimado: 0, costo_real: 0 }),
  obtenerCatalogoEdicionOF: () => Promise.resolve({}), obtenerCalidadOF: () => Promise.resolve(null), obtenerCatalogoAvanceOF: () => Promise.resolve({}), listarPartesOF: () => Promise.resolve([]), obtenerReservasOF: () => Promise.resolve(null), listarMaterialesOF: () => Promise.resolve([]),
  anularOF: vi.fn(), aprobarOF: vi.fn(), enviarACalidadOF: vi.fn(), guardarMaterialOF: vi.fn(), guardarOperacionOF: vi.fn(), liberarOF: vi.fn(), quitarMaterialOF: vi.fn(), quitarOperacionOF: vi.fn(), registrarParteOF: vi.fn(), revisarParteOF: vi.fn(), medirCalidadOF: vi.fn(), abrirNoConformidadOF: vi.fn(), cerrarNoConformidadOF: vi.fn(),
}));
import { DetalleOFPage } from '../src/zahory-mock/pages/of/DetalleOFPage.jsx';

describe('entrega de OF', () => {
  const inicial = () => estadoInicialEntrega({ unidades: [{ unidad: 1, serie: 'S-1' }, { unidad: 2, serie: 'S-2' }], garantia_meses: 12, partida: 'Taller', cliente: { direccion: 'Planta' } });
  it('valida todos los campos de cada paso y las condiciones de transporte', () => {
    const f = inicial();
    expect(Object.keys(validarPasoEntrega(f, 1))).toEqual(['fotos', 'conformidad']);
    f.fotos = [{}]; f.conformidad = 'con_observaciones'; f.unidades[1].serie = 's-1';
    expect(Object.keys(validarPasoEntrega(f, 1))).toEqual(['observaciones', 'serie_0', 'serie_1']);
    expect(Object.keys(validarPasoEntrega(f, 2))).toEqual(['firma_responsable', 'firma_cliente', 'recibe_nombre', 'recibe_dni']);
    expect(Object.keys(validarPasoEntrega(f, 3))).toEqual(['peso_bruto_total', 'vehiculo_placa', 'conductor_nombre', 'conductor_dni', 'conductor_brevete']);
    f.guia.modalidad = 'transportista'; expect(Object.keys(validarPasoEntrega(f, 3))).toEqual(['peso_bruto_total', 'transportista_ruc', 'transportista_razon_social']);
    f.garantia_meses = '120.5'; expect(validarPasoEntrega(f, 4)).toHaveProperty('garantia_meses');
  });
  it('arma el contrato y calcula el fin de mes como PostgreSQL', () => {
    const f = inicial(); f.conformidad = 'conforme'; f.recibe_nombre = ' Ana '; f.recibe_dni = '12345678';
    expect(datosEntrega(f, [{ path: 'foto' }], 'responsable', 'cliente')).toMatchObject({ recibe_nombre: 'Ana', firma_cliente_path: 'cliente', garantia_meses: 12, unidades: [{ unidad: 1, serie: 'S-1' }, { unidad: 2, serie: 'S-2' }], guia: { partida_direccion: 'Taller' } });
    expect(finGarantia('2024-01-31', 1)).toBe('2024-02-29'); expect(finGarantia('2025-01-31', 1)).toBe('2025-02-28'); expect(finGarantia('2025-01-31', 0)).toBe('');
  });
  it('muestra el botón solo en Lista para entrega con permiso', async () => {
    for (const estado of ['lista_entrega', 'entregada', 'cerrada', 'en_calidad']) for (const permiso of [true, false]) {
      mocks.estado = estado; mocks.permiso = permiso; let root;
      await act(async () => { root = TestRenderer.create(<DetalleOFPage routeParams={{ id: 'of1' }} />); for (let i = 0; i < 20; i++) await Promise.resolve(); });
      const botones = root.root.findAllByType('button');
      expect(botones.some(b => b.children.includes('Entregar al cliente'))).toBe(estado === 'lista_entrega' && permiso);
      await act(async () => root.unmount());
    }
  });
});

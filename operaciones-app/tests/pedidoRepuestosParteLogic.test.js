import { describe, expect, it } from 'vitest';
import { armarLineasPedido, describirResultadoLinea, validarPedidosParte } from '../src/zahory-mock/pages/pedidoRepuestosParteLogic.js';

describe('pedidoRepuestosParteLogic', () => {
  it('valida lista vacía y una cantidad correcta', () => {
    expect(validarPedidosParte([])).toBe('');
    expect(validarPedidosParte([{ material_id: 'm1', cantidad: '1.25' }])).toBe('');
  });
  it('requiere material y cantidad positiva', () => {
    expect(validarPedidosParte([{ cantidad: 1 }])).toMatch(/Selecciona un material/);
    expect(validarPedidosParte([{ material_id: 'm1', cantidad: 0 }])).toMatch(/mayor a cero/);
  });
  it('rechaza más de dos decimales y materiales repetidos', () => {
    expect(validarPedidosParte([{ material_id: 'm1', cantidad: 1.234 }])).toMatch(/hasta 2 decimales/);
    expect(validarPedidosParte([{ material_id: 'm1', cantidad: 1 }, { material_id: 'm1', cantidad: 2 }])).toMatch(/No repitas/);
  });
  it('arma líneas de RPC con cantidad numérica', () => {
    expect(armarLineasPedido([{ material_id: 'm1', cantidad: '1,5' }])).toEqual([{ material_id: 'm1', cantidad: 1.5 }]);
  });
  it('describe reserva completa, parcial y sin stock con avisos', () => {
    expect(describirResultadoLinea({ reservado: 2, faltante: 0 })).toEqual({ texto: 'Reservado en almacén', tono: 'is-green' });
    expect(describirResultadoLinea({ reservado: 1, faltante: 2, solpe_codigo: 'SOL-10', aviso: 'Aviso' })).toEqual({ texto: 'Reservado 1 · faltan 2 · SOLPE SOL-10 · Aviso', tono: 'is-amber' });
    expect(describirResultadoLinea({ reservado: 0, faltante: 2, solpe_codigo: 'SOL-11' })).toEqual({ texto: 'Sin stock · SOLPE SOL-11 en curso', tono: 'is-amber' });
  });
});

import { describe, expect, it } from 'vitest';
import { firmaValida, largoTrazo } from '../src/zahory-mock/pages/FirmaTrazo.jsx';

describe('FirmaTrazo · validez de la firma', () => {
  it('mide el recorrido del trazo', () => {
    expect(largoTrazo([[0, 0], [3, 4], [6, 8]])).toBe(10);
    expect(largoTrazo([[5, 5]])).toBe(0);
  });
  it('acepta un trazo recto de dos puntos y rechaza toques sueltos', () => {
    expect(firmaValida([[[10, 10], [200, 120]]])).toBe(true);
    expect(firmaValida([[[10, 10]], [[12, 11], [14, 12]]])).toBe(false);
    expect(firmaValida([])).toBe(false);
  });
});

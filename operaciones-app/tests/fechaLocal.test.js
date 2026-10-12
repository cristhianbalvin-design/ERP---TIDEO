import { describe, expect, it } from 'vitest';
import { fechaLocalISO } from '../src/zahory-mock/pages/fechaLocal.js';

describe('fechaLocalISO', () => {
  it('arma la fecha con los campos locales y no la convierte a UTC', () => {
    const localDate = {
      getFullYear: () => 2026,
      getMonth: () => 9,
      getDate: () => 11,
      toISOString: () => '2026-10-12T04:30:00.000Z',
    };
    expect(fechaLocalISO(localDate)).toBe('2026-10-11');
  });
});

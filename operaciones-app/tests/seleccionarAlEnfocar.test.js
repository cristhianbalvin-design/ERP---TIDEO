import { afterEach, describe, expect, it, vi } from 'vitest';
import { limpiarSeleccionAlDesenfocar, marcarEdicionNumerica, seleccionarAlEnfocar, seleccionarAlPulsar } from '../src/zahory-mock/utils/seleccionarAlEnfocar.js';

describe('seleccionarAlEnfocar', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('selecciona todo al enfocar y programa refuerzos para Android', () => {
    vi.useFakeTimers();
    const select = vi.fn();
    globalThis.document = { activeElement: null };
    globalThis.requestAnimationFrame = callback => { callback(); return 1; };
    const input = { disabled: false, isConnected: true, select, dataset: {} };
    document.activeElement = input;
    seleccionarAlEnfocar({ currentTarget: input });
    expect(select).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(40);
    expect(select).toHaveBeenCalledTimes(3);
    const secondInput = { disabled: false, select: vi.fn(), dataset: {} };
    seleccionarAlPulsar({ currentTarget: secondInput });
    expect(secondInput.select).toHaveBeenCalledOnce();
    marcarEdicionNumerica({ currentTarget: input });
    seleccionarAlPulsar({ currentTarget: input });
    expect(select).toHaveBeenCalledTimes(3);
    limpiarSeleccionAlDesenfocar({ currentTarget: input });
    expect(input.dataset.numericEditing).toBeUndefined();
  });
});

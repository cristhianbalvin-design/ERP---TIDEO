import { afterEach, describe, expect, it, vi } from 'vitest';
import { setWorkMode } from '../src/workMode.js';

describe('setWorkMode', () => {
  afterEach(() => { delete globalThis.document; delete globalThis.window; });
  it('actualiza ambos atributos y despacha los eventos compartido y legado', () => {
    const events = [];
    globalThis.document = { documentElement: { dataset: {} } };
    globalThis.window = { dispatchEvent: event => events.push(event) };
    setWorkMode(true);
    expect(document.documentElement.dataset).toMatchObject({ dxWorkMode: 'true', dxDiagnosticoWorkMode: 'true' });
    expect(events.map(({ type, detail }) => [type, detail.active])).toEqual([['dx-work-mode', true], ['dx-diagnostico-work-mode', true]]);
    setWorkMode(false);
    expect(document.documentElement.dataset).toMatchObject({ dxWorkMode: 'false', dxDiagnosticoWorkMode: 'false' });
    expect(events.slice(2).map(({ type, detail }) => [type, detail.active])).toEqual([['dx-work-mode', false], ['dx-diagnostico-work-mode', false]]);
  });
});

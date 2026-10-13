import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { openWorkNav, setWorkMode } from '../src/workMode.js';
import { WorkMenuButton } from '../src/zahory-mock/components/WorkMenuButton.jsx';

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

describe('WorkMenuButton y openWorkNav', () => {
  it('expone el boton accesible y despacha dx-open-nav al pulsarlo', () => {
    const events = [];
    globalThis.window = { dispatchEvent: event => events.push(event) };
    let renderer;
    act(() => { renderer = create(React.createElement(WorkMenuButton)); });
    const button = renderer.root.findByType('button');
    expect(button.props.className).toBe('dx-work-menu-button');
    expect(button.props['aria-label']).toBe('Abrir menu');
    act(() => button.props.onClick());
    expect(events.map(event => event.type)).toEqual(['dx-open-nav']);
  });
});

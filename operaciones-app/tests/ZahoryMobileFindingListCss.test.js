import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
const compactFindingRules = css;

describe('reglas compactas de filas de hallazgos', () => {
  it('limita box-sizing/min-width sin anular minimos de botones y usa selectores que ganan al flex base', () => {
    expect(compactFindingRules).toContain('.dx-work-page,.dx-recact,.dx-work-page :is(input,select,textarea,.dx-ui-card),.dx-recact :is(input,select,textarea,.dx-recact-field,.dx-recact-control) { box-sizing:border-box; min-width:0; max-width:100%; }');
    expect(compactFindingRules).not.toContain('.dx-work-page *,.dx-recact *');
    expect(css).toContain('.dx-findings-priority-list .dx-finding-list-row{display:flex;align-items:center;gap:10px}');
    expect(compactFindingRules).toContain('.dx-work-page .dx-findings-priority-list .dx-finding-list-row { display:grid;');
    expect(compactFindingRules).toContain('.dx-work-page .dx-findings-priority-list .dx-finding-list-row .dx-finding-list-open { grid-column:1/-1; width:100%; }');
    expect(compactFindingRules).toContain('.dx-work-page .dx-findings-priority-list .dx-finding-list-row>.badge,.dx-work-page .dx-findings-priority-list .dx-finding-list-row>.btn { grid-row:2; }');
    expect(compactFindingRules).toContain('grid-template-columns:auto minmax(0,1fr) minmax(0,1fr)');
    expect(compactFindingRules).toContain('.dx-work-page .dx-findings-priority-list .dx-finding-list-row>.btn { width:100%; white-space:normal; }');
  });
});

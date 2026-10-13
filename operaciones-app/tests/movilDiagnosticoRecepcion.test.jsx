import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/zahory-mock/styles/zahory.css');
const shellCss = read('../src/styles.css');
const pageJsx = read('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx');
const movil = css.slice(css.indexOf('/* movil: diagnostico y recepcion */'));

describe('movil diagnostico y recepcion', () => {
  it('el bloque movil existe y no crea contenedores ni reglas globales fuera de media queries', () => {
    expect(movil.length).toBeGreaterThan(100);
    expect(movil).not.toMatch(/container-type/);
    expect(movil).not.toMatch(/@container/);
    const fueraDeMedia = movil.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    expect(fueraDeMedia).not.toMatch(/\*\s*\{[^}]*min-width:0/);
  });

  it('pasos, barra inferior, formularios y fotos tienen reglas para telefono', () => {
    expect(movil).toMatch(/@media \(max-width:700px\), \(max-height:520px\)[\s\S]*\.dx-work-mobile-step \{ display:flex/);
    expect(movil).toMatch(/\.dx-work-card>\.diagnostico-modal-footer,\.dx-wizard-footer \{[^}]*display:flex; flex-wrap:wrap/);
    expect(movil).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(movil).toMatch(/\.dx-recact-form-grid[^{]*\{ grid-template-columns:minmax\(0,1fr\)/);
    expect(movil).toMatch(/\.dx-foto-grid \{ grid-template-columns:repeat\(2/);
    expect(movil).toMatch(/\.dx-work-page,\.dx-recact,\.dx-work-page :is\(input,select,textarea,\.dx-ui-card\),\.dx-recact :is\(input,select,textarea,\.dx-recact-field,\.dx-recact-control\) \{ box-sizing:border-box; min-width:0; max-width:100%; \}/);
  });

  it('la tarjeta del diagnostico cabe bajo el shell compacto', () => {
    expect(movil).toMatch(/\.dx-work-page \.dx-work-card,\.dx-work-card \{ max-height:calc\(100dvh - 48px\) !important/);
    expect(movil).toMatch(/\.ops-page:has\(\.dx-work-card\),\.ops-page:has\(\.dx-recact\) \{ height:calc\(100dvh - 48px\)/);
  });

  it('el shell compacta menu y cabecera solo en modo diagnostico', () => {
    expect(shellCss).toMatch(/\.ops-sidebar\.is-work-drawer \{[^}]*width:min\(84vw,320px\)/);
    expect(shellCss).toMatch(/height:48px/);
    expect(shellCss).not.toMatch(/is-diagnostico-rail \{ display:flex/);
  });

  it('el JSX expone Detalles colapsable e indicador Paso N de 6 con segmentos accesibles', () => {
    expect(pageJsx).toMatch(/className="dx-work-meta-toggle" aria-label="Detalles" aria-expanded=\{metaOpen\}/);
    expect(pageJsx).toMatch(/setMetaOpen\(open => !open\)/);
    expect(pageJsx).toContain('Paso {workStep} de 6');
    expect(pageJsx).toMatch(/aria-label=\{`Paso \$\{index \+ 1\}: \$\{label\}`\}/);
  });
});

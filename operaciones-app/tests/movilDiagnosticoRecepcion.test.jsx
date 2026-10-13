import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/zahory-mock/styles/zahory.css');
const shellCss = read('../src/styles.css');
const pageJsx = read('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx');
const appJsx = read('../src/OperationalApp.jsx');
const endOwnCss = css.includes('/* Solicitudes SOLPE */') ? css.indexOf('/* Solicitudes SOLPE */') : css.length;
const movil = css.slice(css.indexOf('/* movil: diagnostico y recepcion */'), endOwnCss);
const compact = css.slice(css.indexOf('/* Compact work mode refinements */'), endOwnCss);

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

  it('la tarjeta ocupa el viewport y no conserva offsets de cabecera en compacto', () => {
    expect(movil).not.toMatch(/calc\(100dvh - (48|68)px\)/);
    expect(movil).toMatch(/\.dx-work-page\.dx-scope\.dx-work-card[^}]*height:100dvh !important/);
    expect(movil).toMatch(/\.ops-page:has\(\.dx-work-card\) \{ height:100dvh !important/);
    expect(movil).toMatch(/\.ops-page:has\(\.dx-recact\) \{ height:auto !important; min-height:100dvh/);
  });

  it('ajusta alto, identidad, avisos y footer del diagnostico en compacto', () => {
    expect(movil).toMatch(/\.dx-work-page\.dx-scope\.dx-work-card[^}]*height:100dvh !important/);
    expect(movil).toMatch(/\.dx-work-page \.dx-work-identity-status strong \{ display:none/);
    expect(movil).toMatch(/\.dx-work-card \.alert:not\(\.dx-footer-floating-alert\) \{ font-size:12px; line-height:1\.3; padding:6px 10px; margin-block:6px; border-radius:8px/);
    expect(movil).toMatch(/\.dx-work-card>\.diagnostico-modal-footer>\.btn[^}]*min-height:40px; height:40px; padding:0 8px; font-size:12px/);
    expect(movil).toMatch(/\.dx-work-card>\.diagnostico-modal-footer>\.btn-primary[^}]*flex:1 1 auto; overflow:hidden; text-overflow:ellipsis/);
    expect(movil).toMatch(/\.dx-footer-floating-alert[^}]*max-height:72px[^}]*font-size:12px/);
  });

  it('corrige hallazgos, segmented, gutters y scroll compacto', () => {
    expect(movil).toMatch(/\.dx-work-page\.dx-scope \{ padding:0; overflow:hidden; \}/);
    expect(movil).toMatch(/\.dx-work-page \.dx-scope \{ padding:0; overflow-x:hidden; overflow-y:auto; \}/);
    expect(movil).not.toMatch(/\.dx-work-page(?: \.dx-scope|\.dx-scope)\s*\{[^}]*padding-bottom:var\(--dx-footer-h\)/);
    expect(movil).toMatch(/\.dx-work-page \.dx-body \{ padding:8px; gap:8px/);
    expect(movil).toMatch(/\.dx-work-page \.dx-findings-list-group \{ padding:8px/);
    expect(movil).toMatch(/\.hallazgo-grid[^}]*grid-template-columns:minmax\(0,1fr\) !important/);
    expect(movil).toMatch(/\.dx-recact-segmented \{ display:flex; flex-wrap:wrap/);
    expect(movil).toMatch(/\.dx-recact \{ min-height:100dvh; padding:8px/);
    expect(movil).toMatch(/\.dx-recact-form-body[^}]*padding:12px/);
    expect(movil).toMatch(/--dx-footer-h:64px/);
    expect(movil).toMatch(/\.dx-work-page \.hallazgo-measurement-table,\.dx-work-page \.hallazgo-task-table \{ display:block; width:100%; min-width:0/);
    expect(movil).toMatch(/\.ot-form-grid\.commercial[^}]*grid-template-columns:minmax\(0,1fr\)/);
  });
  it('fija la seccion al viewport compacto y deja el scroll solo en el contenido interior', () => {
    expect(compact).toMatch(/\.dx-work-page\.dx-scope\.dx-work-card \{ position:fixed; inset:0; z-index:900; width:100vw; height:100dvh !important/);
    expect(compact).toMatch(/\.dx-work-page > \.dx-scope \{ flex:1 1 0%; min-height:0; overflow-x:hidden; overflow-y:auto; padding:0; \}/);
    expect(compact).toMatch(/\.dx-work-page > \.diagnostico-modal-footer \{ position:static; bottom:auto; z-index:auto; flex:none; margin-top:0; \}/);
    expect(compact).toMatch(/\.dx-work-page > \.ops-modal-confirm-backdrop \{ z-index:20001; \}/);
    expect(compact).not.toMatch(/\.dx-work-page(?: >)? \.dx-scope \{[^}]*padding-bottom:var\(--dx-footer-h\)/);
  });

  it('el shell compacta menu y cabecera solo en modo diagnostico', () => {
    expect(shellCss).toMatch(/\.ops-sidebar\.is-work-drawer \{[^}]*width:min\(84vw,320px\)/);
    expect(shellCss).toMatch(/height:48px/);
    expect(shellCss).not.toMatch(/is-diagnostico-rail \{ display:flex/);
    expect(shellCss).toMatch(/\.header:has\(\.ops-work-menu-button\) \{ display:none !important/);
  });

  it('el JSX expone Detalles colapsable e indicador Paso N de 6 con segmentos accesibles', () => {
    expect(pageJsx).toMatch(/className="dx-work-meta-toggle" aria-label="Detalles" aria-expanded=\{metaOpen\}/);
    expect(pageJsx).toMatch(/setMetaOpen\(open => !open\)/);
    expect(pageJsx).toContain('Paso {workStep} de 6');
    expect(pageJsx).toMatch(/aria-label=\{`Paso \$\{index \+ 1\}: \$\{label\}`\}/);
  });

  it('el footer compacto conserva una sola fila y los nombres completos para accesibilidad', () => {
    expect(compact).toMatch(/\.dx-work-card>\.diagnostico-modal-footer,\.dx-wizard-footer \{[^}]*flex-wrap:nowrap/);
    expect(compact).toMatch(/\.dx-footer-label-compact::after \{ content:attr\(data-label\); \}/);
    expect(pageJsx).toContain('data-label="Trabajos →"');
    expect(pageJsx).toContain('data-label="Informe →"');
    expect(pageJsx).toContain("? 'Cerrar' : '+ Trabajo'");
    expect(pageJsx).toContain('aria-label="Siguiente: Trabajos"');
    expect(pageJsx).toContain('aria-label="Siguiente: Diagnóstico e informe"');
  });

  it('el retorno desde el cajón comparte el evento de vuelta con las dos pantallas', () => {
    expect(appJsx).toContain('requestWorkBack(); setNavOpen(false);');
    expect(pageJsx).toContain("window.addEventListener('dx-work-back', handleWorkBack)");
    const receptionPage = read('../src/zahory-mock/pages/RecepcionActivosClientePage.jsx');
    expect(receptionPage).toContain("window.addEventListener('dx-work-back', handleWorkBack)");
    expect(receptionPage).toContain('aria-label="Volver a recepciones"');
  });
});

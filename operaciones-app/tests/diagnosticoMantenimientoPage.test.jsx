import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const page = await readFile(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/diagnosticoTecnicoService.js', import.meta.url), 'utf8');
const flow = await readFile(new URL('../src/zahory-mock/pages/diagnosticoFlujo.js', import.meta.url), 'utf8');

describe('Flujo de mantenimiento en página', () => {
  it('usa la ruta nueva y una página en vez del contenedor de diálogo para ambos tipos', () => {
    expect(page).toContain('const diagnosticoHash = params => `/diagnostico-tecnico');
    expect(page).toContain("query.set('nuevo', tipo)");
    expect(page).toContain('const workPage = Boolean(selected || form.tipo);');
    expect(page).toMatch(/pageMode=\{workPage\}/);
    expect(page).toMatch(/className="dx-initial-flow"/);
    expect(page).not.toMatch(/key=\{selected\?\.id \|\| `nuevo-\$\{form\.tipo\}`\}/);
  });

  it('no crea el borrador antes del paso 3 y valida motivo, técnico y fecha sin trabajos a evaluar', () => {
    expect(page).toMatch(/wizardStep < 3\) \{ event\.preventDefault\(\); setWizardStep/);
    expect(page).toContain('datosInicialesValidos(selectedReference, datosIniciales)');
    expect(page).not.toContain('Trabajos a evaluar');
    expect(service).not.toContain('p_trabajos_evaluar:');
    expect(page).toContain('Crear borrador y continuar');
    expect(service).toMatch(/rpc\('crear_diagnostico_tecnico_inicial'/);
  });

  it('permite redactar y guardar el diagnóstico antes del panel Informe', () => {
    const report = page.indexOf('<DiagnosticoInformePanel');
    const card = page.indexOf('dx-report-diagnosis-card', report);
    const cardEnd = page.indexOf('</section>}', card);
    expect(report).toBeGreaterThanOrEqual(0);
    expect(card).toBeGreaterThan(report);
    expect(page.slice(report, card)).toContain('encabezadoControles={');
    expect(page.slice(card, cardEnd)).toContain('aria-label="Diagnóstico"');
    expect(page.slice(card, cardEnd)).toContain('onClick={guardarResumenParaInforme}');
    expect(page).toContain('inline onClose=');
    expect(page).toContain('markupDibujoHallazgo(selected.componente_svg ||');
    expect(page).toContain("borradores.length === 1 ? 'borrador' : 'borradores'");
    expect(page).toContain("estado === 'en_diagnostico' ? 'En diagn\u00f3stico'");
    expect(page).not.toContain('new Date().toISOString().slice(0, 10)');
  });
  it('el borrador existente muestra una sola navegación con los pasos de su tipo', () => {
    expect(page).not.toContain("workStep === 3 ? 'is-current' : ''");
    expect(page).toContain('pasos.map((label, index)');
    expect(page).toContain('const pasos = pasosDiagnostico(tipoActual);');
    expect(flow).toContain("'Trabajos a realizar'");
    expect(flow).toContain("'Diagn\\u00f3stico e informe'");
    expect(flow).toContain("'Emitir y costear'");
  });
  it('restablece estado temporal del panel de tareas al abrir un borrador', () => {
    const start = page.indexOf('const openExisting = async diagnostico => {');
    const end = page.indexOf('  return (', start);
    const openExisting = page.slice(start, end);
    expect(openExisting).toContain('setTaskPanel(false)');
    expect(openExisting).toContain('setTaskPanelHasSelection(false)');
  });
});

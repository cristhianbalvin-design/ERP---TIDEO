import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const page = await readFile(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/diagnosticoTecnicoService.js', import.meta.url), 'utf8');
const flow = await readFile(new URL('../src/zahory-mock/pages/diagnosticoFlujo.js', import.meta.url), 'utf8');

describe('Flujo de mantenimiento en página', () => {
  it('usa la ruta nueva y una página en vez del contenedor de diálogo', () => {
    expect(page).toMatch(/window\.location\.hash = `\/diagnostico-tecnico\?nuevo=mantenimiento/);
    expect(page).toMatch(/pageMode=\{maintenancePage\}/);
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
    const card = page.indexOf('dx-report-diagnosis-card');
    const report = page.indexOf('<DiagnosticoInformePanel', card);
    expect(card).toBeGreaterThanOrEqual(0);
    expect(report).toBeGreaterThan(card);
    expect(page.slice(card, report)).toContain('aria-label="Diagnóstico"');
    expect(page.slice(card, report)).toContain('onClick={guardarResumenParaInforme}');
    expect(page).toContain('inline onClose=');
    expect(page).toContain('markupDibujoHallazgo(selected.componente_svg ||');
    expect(page).toContain("borradores.length === 1 ? 'borrador' : 'borradores'");
    expect(page).toContain("estado === 'en_diagnostico' ? 'En diagn\u00f3stico'");
    expect(page).not.toContain('new Date().toISOString().slice(0, 10)');
  });
  it('el borrador existente muestra una sola navegación de seis pasos', () => {
    expect(page).not.toContain("workStep === 3 ? 'is-current' : ''");
    expect(page).toContain('PASOS_MANTENIMIENTO.map((label, index)');
    expect(flow).toContain("'Trabajos a realizar'");
    expect(flow).toContain("'Diagn\\u00f3stico e informe'");
  });
  it('restablece estado temporal del panel de tareas al abrir un borrador', () => {
    const start = page.indexOf('const openExisting = async diagnostico => {');
    const end = page.indexOf('  return (', start);
    const openExisting = page.slice(start, end);
    expect(openExisting).toContain('setTaskPanel(false)');
    expect(openExisting).toContain('setTaskPanelHasSelection(false)');
  });
});

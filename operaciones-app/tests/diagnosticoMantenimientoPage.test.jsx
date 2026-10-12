import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const page = await readFile(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/diagnosticoTecnicoService.js', import.meta.url), 'utf8');

describe('Flujo de mantenimiento en página', () => {
  it('usa la ruta nueva y una página en vez del contenedor de diálogo', () => {
    expect(page).toMatch(/window\.location\.hash = '\/diagnostico-tecnico\?nuevo=mantenimiento'/);
    expect(page).toMatch(/pageMode=\{maintenancePage\}/);
    expect(page).toMatch(/className="dx-initial-flow"/);
    expect(page).not.toMatch(/key=\{selected\?\.id \|\| `nuevo-\$\{form\.tipo\}`\}/);
  });

  it('no crea el borrador antes del paso 3 y valida los campos requeridos', () => {
    expect(page).toMatch(/wizardStep < 3\) \{ event\.preventDefault\(\); setWizardStep/);
    expect(page).toMatch(/datosIniciales\.motivo\.trim\(\) && datosIniciales\.trabajos_evaluar\.length && datosIniciales\.tecnico_id && datosIniciales\.fecha_inspeccion/);
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
  });
});

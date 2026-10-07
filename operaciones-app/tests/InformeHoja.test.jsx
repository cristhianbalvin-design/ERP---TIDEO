import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { InformeHoja } from '../src/zahory-mock/pages/InformeHoja.jsx';

const getText = node => node?.children?.map(child => typeof child === 'string' ? child : getText(child)).join('') || '';

describe('InformeHoja', () => {
  it('muestra datos faltantes como guion y no contiene fotos ni placeholders de foto', () => {
    const renderer = create(<InformeHoja snapshot={{ cabecera: { horometro: null, activo_nombre: null }, hallazgos: [], mediciones: [], tareas_repuestos: [], resumen: {}, conclusion: null }} />);
    const output = getText(renderer.toJSON());
    expect(output).toContain('—');
    expect(output).toContain('Vista previa · Borrador');
    expect(output).not.toMatch(/foto|imagen/i);
    renderer.unmount();
  });

  it('renderiza secciones según los datos disponibles', () => {
    const renderer = create(<InformeHoja snapshot={{ cabecera: {}, hallazgos: [{ hallazgo_id: 'h1', componente_parte: 'Bomba', condicion_etiqueta: 'Conforme', prioridad: 'P4', observacion: 'Sin novedad', accion_recomendada_etiqueta: 'Monitorear' }], mediciones: [], tareas_repuestos: [{ linea_id: 'l1', tarea_nombre: 'Ajustar', cargo_nombre: 'Técnico', horas_mano_obra: 2, materiales: [] }], resumen: { P4: 1 }, conclusion: 'Operativo' }} />);
    const output = getText(renderer.toJSON());
    expect(output).toContain('Hallazgos');
    expect(output).toContain('Bomba');
    expect(output).toContain('Trabajos propuestos');
    expect(output).toContain('Conclusión');
    renderer.unmount();
  });

  it('muestra el logo de empresa y conserva el marcador si la imagen falla', async () => {
    let renderer;
    await act(async () => { renderer = create(<InformeHoja snapshot={{ cabecera: {}, hallazgos: [], mediciones: [], tareas_repuestos: [], resumen: {} }} identidadEmpresa={{ logo_url: 'https://assets/logo.png', razon_social: 'Tideo', ruc: '201' }} />); await Promise.resolve(); });
    let image = renderer.root.findByType('img');
    expect(image.props.alt).toBe('Logo de la empresa');
    expect(image.props.src).toBe('https://assets/logo.png');
    await act(async () => { image.props.onError(); await Promise.resolve(); });
    expect(getText(renderer.toJSON())).toContain('[Logo empresa]');
    renderer.unmount();
  });
});

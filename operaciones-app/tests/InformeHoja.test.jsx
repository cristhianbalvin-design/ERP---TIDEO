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

  it('renderiza las fotos del hallazgo con su leyenda como texto alternativo', () => {
    const renderer = create(<InformeHoja snapshot={{ cabecera: {}, hallazgos: [{ hallazgo_id: 'h1', componente_parte: 'Bomba', fotos: [{ url: 'https://signed/f1', leyenda: 'Vista del sello' }, { url: 'https://signed/f2', leyenda: null }] }], mediciones: [], tareas_repuestos: [], resumen: {} }} />);
    const images = renderer.root.findAllByType('img');
    expect(images.map(image => image.props.src)).toEqual(['https://signed/f1', 'https://signed/f2']);
    expect(images.map(image => image.props.alt)).toEqual(['Vista del sello', 'Foto del hallazgo']);
    renderer.unmount();
  });

  it('no renderiza fotos cuando la lista está vacía', () => {
    const renderer = create(<InformeHoja snapshot={{ cabecera: {}, hallazgos: [{ hallazgo_id: 'h1', componente_parte: 'Bomba', fotos: [] }], mediciones: [], tareas_repuestos: [], resumen: {} }} />);
    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    renderer.unmount();
  });
});

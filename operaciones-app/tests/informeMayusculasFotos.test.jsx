import React from 'react';
import { readFileSync } from 'node:fs';
import { create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { Image, Page } from '@react-pdf/renderer';
import InformePdf from '../src/zahory-mock/pages/InformePdf.jsx';
import { InformeHoja } from '../src/zahory-mock/pages/InformeHoja.jsx';

const baseSnapshot = overrides => ({ cabecera: {}, hallazgos: [], mediciones: [], tareas_repuestos: [], resumen: {}, ...overrides });
const imageHeight = node => (Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style).height;

describe('informe B: mayusculas y fotos grandes', () => {
  it('documenta uppercase para toda la hoja HTML y deja cada fila con columnas segun su cantidad', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    expect(css).toContain('.dx-inf-sheet, .dx-inf-sheet * { text-transform: uppercase; }');
    const renderer = create(<InformeHoja snapshot={baseSnapshot({ hallazgos: [{ hallazgo_id: 'h1', fotos: [
      { url: 'a', ancho: 1200, alto: 800, leyenda: 'vista frontal' },
      { url: 'b', ancho: 900, alto: 700, leyenda: 'detalle' },
    ] }] })} />);
    const row = renderer.root.find(node => node.props.className?.includes('dx-informe-fila'));
    expect(row.props.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    renderer.unmount();
  });

  it('aplica uppercase al PDF y calcula el alto real por proporcion y ancho util', () => {
    const renderer = create(<InformePdf snapshot={baseSnapshot({
      cabecera: { activo_nombre: 'bomba ß Ø' },
      hallazgos: [{ hallazgo_id: 'h1', componente_parte: 'bomba', fotos: [
        { ruta_storage: 'single', ancho: 2000, alto: 1000, leyenda: 'frente' },
        { ruta_storage: 'horizontal-1', ancho: 2000, alto: 1000, leyenda: 'lateral' },
        { ruta_storage: 'horizontal-2', ancho: 2000, alto: 1000, leyenda: 'detalle' },
        { ruta_storage: 'vertical-1', ancho: 500, alto: 1000, leyenda: 'detalle superior' },
        { ruta_storage: 'vertical-2', ancho: 500, alto: 1000, leyenda: 'detalle central' },
        { ruta_storage: 'vertical-3', ancho: 500, alto: 1000, leyenda: 'detalle inferior' },
      ] }],
    })} imagenes={{ fotos: Object.fromEntries(['single', 'horizontal-1', 'horizontal-2', 'vertical-1', 'vertical-2', 'vertical-3'].map((key, index) => [key, `data:image/jpeg;base64,${index}`])), dimensionesFotos: {} }} />);
    const page = renderer.root.findByType(Page);
    expect(page.props.style.textTransform).toBe('uppercase');
    const images = renderer.root.findAllByType(Image);
    expect(images.map(imageHeight)).toEqual([124.32, 124.32, 251.64, 300, 300, 300]);
    expect(images.map(image => image.parent.props.style.flexGrow)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(images.map(image => image.parent.parent.props.style.width)).toEqual(['100%', '100%', '100%', '100%', '100%', '100%']);
    expect(images.map(image => image.parent.parent.children.length)).toEqual([2, 2, 1, 3, 3, 3]);
    expect(images.every(image => image.parent.parent.props.wrap === false)).toBe(true);
    renderer.unmount();
  });
});

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inspector } from '../src/zahory-mock/pages/planner/Inspector.jsx';

describe('aviso de OT cerrada en Planner', () => {
  for (const estado of ['cerrada', 'anulada', 'valorizada', 'cerrado_conforme']) {
    it(`muestra el aviso sin acción para estado ${estado}`, () => {
      const html = renderToStaticMarkup(createElement(Inspector, {
        ot: { id: 'OT-1', estado },
        recursos: {},
      }));
      expect(html).toContain(
        'Esta OT está cerrada. Reábrela desde la Bandeja de OTs para volver a planificarla.',
      );
      expect(html).not.toContain('<button');
    });
  }
});

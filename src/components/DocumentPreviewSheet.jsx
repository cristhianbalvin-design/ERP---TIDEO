import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeRichTextDocument } from './RichTextEditor.jsx';
import { DocumentPreviewRichText } from './DocumentPreviewRichText.jsx';
import { renderTextoDocumental } from '../lib/variablesDocumentales.js';

export const PREVIEW_SHEET_HEIGHT = 1056;
export const PREVIEW_SHEET_VERTICAL_PADDING = 128;
export const PREVIEW_BODY_TOP_PADDING = 0;

export const orderDocumentPreviewBlocks = blocks => [...blocks].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
export const previewBlockKey = block => block.client_key || block.id || `block-${block.orden || 0}-${block.titulo || ''}`;
export const normalizedPreviewScope = scope => scope === 'primera' ? 'primera' : 'todas';

export const previewMeasurementKey = (plantilla, bloques, contexto = null, categoria = 'cotizacion') => {
  const raiz = orderDocumentPreviewBlocks(bloques.filter(block => !block.bloque_padre_id));
  return JSON.stringify({
    encabezado:plantilla?.encabezado_json || null,
    pie:plantilla?.pie_json || null,
    encabezadoAlcance:normalizedPreviewScope(plantilla?.encabezado_alcance),
    pieAlcance:normalizedPreviewScope(plantilla?.pie_alcance),
    categoria,
    contexto,
    bloques:raiz.map(block => ({ key:previewBlockKey(block), titulo:block.titulo, tipo:block.tipo_bloque, contenido:block.contenido_json, texto:block.contenido_texto_plano })),
    hijos:bloques.filter(block => block.bloque_padre_id).map(block => ({ key:previewBlockKey(block), padre:block.bloque_padre_id, titulo:block.titulo, tipo:block.tipo_bloque, contenido:block.contenido_json, texto:block.contenido_texto_plano })),
  });
};

export const previewPageCapacity = (pageIndex, encabezadoAlcance, pieAlcance, medidas) => {
  const mostrarEncabezado = pageIndex === 0 || encabezadoAlcance === 'todas';
  const mostrarPie = pageIndex === 0 || pieAlcance === 'todas';
  return Math.max(80, PREVIEW_SHEET_HEIGHT - PREVIEW_SHEET_VERTICAL_PADDING - PREVIEW_BODY_TOP_PADDING - (mostrarEncabezado ? medidas.encabezado : 0) - (mostrarPie ? medidas.pie : 0));
};

const fallbackTable = () => ({ columnas:[{ id:'preview-column-1', titulo:'Columna 1', tipo:'texto' }], filas:[] });
const normalizeTable = value => {
  const columnas = Array.isArray(value?.columnas) ? value.columnas.filter(column => column?.id).map(column => ({ id:column.id, titulo:column.titulo || '', tipo:column.tipo === 'check' ? 'check' : 'texto' })) : [];
  const safeColumns = columnas.length ? columnas : fallbackTable().columnas;
  const filas = Array.isArray(value?.filas) ? value.filas.map((row, index) => ({ id:row?.id || `preview-row-${index}`, valores:Object.fromEntries(safeColumns.map(column => [column.id, row?.valores?.[column.id] ?? (column.tipo === 'check' ? false : '')])) })) : [];
  return { columnas:safeColumns, filas };
};
const renderTableText = (value, categoria, contexto) => (
  categoria && contexto !== null && contexto !== undefined
    ? renderTextoDocumental(value, categoria, contexto)
    : String(value ?? '')
);

const normalizeSectionColumns = value => {
  const source = Array.isArray(value?.columnas) ? value.columnas.slice(0, 3) : [{ id:'legacy-column-1', contenido_json:value }];
  const count = Math.max(1, source.length);
  return source.map((column, index) => ({ id:column?.id || `column-${index + 1}`, ancho:`${100 / count}%`, contenido_json:normalizeRichTextDocument(column?.contenido_json) }));
};

function VistaBloque({ block, bloques, categoria, contexto, measurementRef = null }) {
  const hijos = orderDocumentPreviewBlocks(bloques.filter(item => item.bloque_padre_id === block.id));
  const tabla = block.tipo_bloque === 'tabla' ? normalizeTable(block.contenido_json) : null;
  const grupo = block.tipo_bloque === 'grupo_repetible' ? { fuente_repeticion:'', titulo_item:'', ...(block.contenido_json || {}) } : null;
  return <section ref={measurementRef} className="document-preview-block">
    {block.titulo && <h4>{block.titulo}</h4>}
    {block.tipo_bloque === 'texto_rico' && <DocumentPreviewRichText value={block.contenido_json} categoria={categoria} contexto={contexto} />}
    {tabla && <div className="document-preview-table-wrap"><table className="document-preview-table"><thead><tr>{tabla.columnas.map(columna => <th key={columna.id}>{renderTableText(columna.titulo, categoria, contexto)}</th>)}</tr></thead><tbody>{tabla.filas.map(fila => <tr key={fila.id}>{tabla.columnas.map(columna => <td key={columna.id}>{columna.tipo === 'check' ? (fila.valores[columna.id] ? '✓' : '') : renderTableText(fila.valores[columna.id], categoria, contexto)}</td>)}</tr>)}</tbody></table></div>}
    {grupo && <div className="document-preview-repeat"><div className="document-preview-repeat-note">↻ Se repite por cada {grupo.fuente_repeticion || 'elemento'}</div>{grupo.titulo_item && <h4>{grupo.titulo_item}</h4>}{hijos.map(hijo => <VistaBloque key={hijo.client_key || hijo.id} block={hijo} bloques={bloques} categoria={categoria} contexto={contexto} />)}</div>}
  </section>;
}

function VistaSeccionPlantilla({ value, categoria, contexto }) {
  const columns = normalizeSectionColumns(value);
  return <div className="document-preview-columns" style={{gridTemplateColumns:columns.map(column => column.ancho).join(' ')}}>{columns.map(column => <div key={column.id} className="document-preview-column"><DocumentPreviewRichText value={column.contenido_json} categoria={categoria} contexto={contexto} /></div>)}</div>;
}

// Sin contexto, conserva los tokens literales del editor administrativo.
export function DocumentPreviewSheet({ plantilla, bloques = [], categoria = 'cotizacion', contexto = null, zoom = 100, onZoom = () => {}, measurementOnly = false, onMeasurementsChange }) {
  const raiz = orderDocumentPreviewBlocks(bloques.filter(bloque => !bloque.bloque_padre_id));
  const measureSheetRef = useRef(null);
  const measureHeaderRef = useRef(null);
  const measureFooterRef = useRef(null);
  const measureBlockRefs = useRef(new Map());
  const [medidas, setMedidas] = useState(null);
  const encabezadoAlcance = normalizedPreviewScope(plantilla?.encabezado_alcance);
  const pieAlcance = normalizedPreviewScope(plantilla?.pie_alcance);
  const measurementKey = useMemo(() => previewMeasurementKey(plantilla, bloques, contexto, categoria), [plantilla, bloques, contexto, categoria]);

  useLayoutEffect(() => {
    let activo = true;
    const medir = () => {
      if (!activo) return;
      const heights = Object.fromEntries(raiz.map(block => {
        const node = measureBlockRefs.current.get(previewBlockKey(block));
        if (!node) return [previewBlockKey(block), 0];
        const styles = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return [previewBlockKey(block), rect.height + Number.parseFloat(styles.marginTop || 0) + Number.parseFloat(styles.marginBottom || 0)];
      }));
      const footerStyles = measureFooterRef.current ? window.getComputedStyle(measureFooterRef.current) : null;
      const next = { key:measurementKey, bloques:heights, encabezado:measureHeaderRef.current?.getBoundingClientRect().height || 0, pie:(measureFooterRef.current?.getBoundingClientRect().height || 0) + Number.parseFloat(footerStyles?.marginTop || 0) };
      setMedidas(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const frame = window.requestAnimationFrame(medir);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    [measureSheetRef.current, measureHeaderRef.current, measureFooterRef.current, ...measureBlockRefs.current.values()].filter(Boolean).forEach(node => observer?.observe(node));
    document.fonts?.ready?.then(medir);
    return () => { activo = false; window.cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [measurementKey]);

  useEffect(() => { onMeasurementsChange?.(medidas); }, [medidas, onMeasurementsChange]);

  const todasLasAlturasMedidas = medidas?.key === measurementKey && raiz.every(block => Number(medidas.bloques?.[previewBlockKey(block)]) > 0);
  const paginas = useMemo(() => {
    if (!todasLasAlturasMedidas) return [raiz];
    const resultado = [];
    let paginaActual = [];
    let altoUsado = 0;
    raiz.forEach(block => {
      const altoBloque = medidas.bloques[previewBlockKey(block)];
      const altoDisponible = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
      if (paginaActual.length && altoUsado + altoBloque > altoDisponible) { resultado.push(paginaActual); paginaActual = []; altoUsado = 0; }
      paginaActual.push(block);
      altoUsado += altoBloque;
    });
    if (paginaActual.length || !resultado.length) resultado.push(paginaActual);
    return resultado;
  }, [todasLasAlturasMedidas, raiz, encabezadoAlcance, pieAlcance, medidas]);

  const medicion = <div className="document-preview-measure" aria-hidden="true"><article ref={measureSheetRef} className="document-preview-sheet">
    <header ref={measureHeaderRef} className="document-preview-header"><VistaSeccionPlantilla value={plantilla?.encabezado_json} categoria={categoria} contexto={contexto} /></header>
    <main className="document-preview-body">{raiz.map(bloque => <VistaBloque key={previewBlockKey(bloque)} measurementRef={node => { const key = previewBlockKey(bloque); if (node) measureBlockRefs.current.set(key, node); else measureBlockRefs.current.delete(key); }} block={bloque} bloques={bloques} categoria={categoria} contexto={contexto} />)}</main>
    <footer ref={measureFooterRef} className="document-preview-footer"><VistaSeccionPlantilla value={plantilla?.pie_json} categoria={categoria} contexto={contexto} /></footer>
  </article></div>;

  if (measurementOnly) return medicion;

  return <div className="document-preview">
    <div className="document-preview-toolbar"><span className="text-muted">Vista previa</span><div className="row" style={{gap:6}}><button type="button" className="btn btn-ghost" onClick={() => onZoom(zoom - 10)} disabled={zoom <= 50} aria-label="Alejar">−</button><span className="document-preview-zoom">{zoom}%</span><button type="button" className="btn btn-ghost" onClick={() => onZoom(zoom + 10)} disabled={zoom >= 150} aria-label="Acercar">+</button></div></div>
    <div className="document-preview-stage" style={{'--document-preview-scale': zoom / 100}}><div className="document-preview-pages">{paginas.map((pagina, index) => {
      const mostrarEncabezado = index === 0 || encabezadoAlcance === 'todas';
      const mostrarPie = index === 0 || pieAlcance === 'todas';
      return <div key={`pagina-${index}`} className="document-preview-sheet-frame"><article className="document-preview-sheet" aria-label={`Vista previa de documento, página ${index + 1}`}>
        {mostrarEncabezado && <header className="document-preview-header"><VistaSeccionPlantilla value={plantilla?.encabezado_json} categoria={categoria} contexto={contexto} /></header>}
        <main className="document-preview-body">{pagina.map(bloque => <VistaBloque key={previewBlockKey(bloque)} block={bloque} bloques={bloques} categoria={categoria} contexto={contexto} />)}</main>
        {mostrarPie && <footer className="document-preview-footer"><VistaSeccionPlantilla value={plantilla?.pie_json} categoria={categoria} contexto={contexto} /></footer>}
      </article></div>;
    })}</div>{medicion}</div>
  </div>;
}

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeRichTextDocument } from './RichTextEditor.jsx';
import { DocumentPreviewRichText } from './DocumentPreviewRichText.jsx';
import { renderTextoDocumental } from '../lib/variablesDocumentales.js';
import { getDocumentRepeatSource, getRepeatSourceItems } from '../lib/documentRepeatSources.js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

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

const esBloqueCondicionesGenerales = bloque => bloque?.tipo_bloque === 'condiciones_generales';
const tieneCondicionesMaterializadas = bloque => Array.isArray(bloque?.contenido_json?.segmentos);

function useCondicionesGeneralesPublicadas(plantilla, bloques) {
  const requiereResolucion = bloques.some(bloque => esBloqueCondicionesGenerales(bloque) && !tieneCondicionesMaterializadas(bloque));
  const [estado, setEstado] = useState({ estado:'cargando', segmentos:[], mensaje:'' });

  useEffect(() => {
    if (!requiereResolucion) {
      setEstado({ estado:'inactivo', segmentos:[], mensaje:'' });
      return;
    }
    if (!isSupabaseConfigured() || !plantilla?.tipo_documento_id || !plantilla?.empresa_id) {
      setEstado({ estado:'error', segmentos:[], mensaje:'No se pudo identificar la plantilla para resolver las condiciones generales.' });
      return;
    }
    let activo = true;
    setEstado({ estado:'cargando', segmentos:[], mensaje:'' });
    (async () => {
      try {
        const sb = await getSupabaseClient();
        let bibliotecaQuery = sb
          .from('biblioteca_condiciones_generales')
          .select('id')
          .eq('empresa_id', plantilla.empresa_id)
          .eq('tipo_documento_id', plantilla.tipo_documento_id)
          .eq('estado', 'publicada')
          .order('version', { ascending:false })
          .limit(1);
        bibliotecaQuery = plantilla.sociedad_id
          ? bibliotecaQuery.eq('sociedad_id', plantilla.sociedad_id)
          : bibliotecaQuery.is('sociedad_id', null);
        const { data:bibliotecas, error:bibliotecaError } = await bibliotecaQuery;
        if (bibliotecaError) throw bibliotecaError;
        const biblioteca = bibliotecas?.[0];
        if (!biblioteca) {
          if (activo) setEstado({ estado:'sin_biblioteca', segmentos:[], mensaje:'No hay condiciones generales publicadas para este tipo de documento.' });
          return;
        }
        const { data:segmentos, error:segmentosError } = await sb
          .from('condiciones_generales_segmentos')
          .select('id,titulo,contenido_json,contenido_texto_plano,orden')
          .eq('condiciones_generales_id', biblioteca.id)
          .eq('activo', true)
          .order('orden');
        if (segmentosError) throw segmentosError;
        if (activo) setEstado((segmentos || []).length
          ? { estado:'listo', segmentos:segmentos || [], mensaje:'' }
          : { estado:'sin_segmentos', segmentos:[], mensaje:'La biblioteca publicada no tiene segmentos activos.' });
      } catch (error) {
        if (activo) setEstado({ estado:'error', segmentos:[], mensaje:'No se pudieron cargar las condiciones generales publicadas.' });
      }
    })();
    return () => { activo = false; };
  }, [requiereResolucion, plantilla?.empresa_id, plantilla?.sociedad_id, plantilla?.tipo_documento_id]);

  return estado;
}

const bloquesConCondicionesResueltas = (bloques, condiciones) => bloques.map(bloque => {
  if (!esBloqueCondicionesGenerales(bloque) || tieneCondicionesMaterializadas(bloque)) return bloque;
  return {
    ...bloque,
    contenido_json:{
      ...(bloque.contenido_json || {}),
      segmentos:condiciones.segmentos,
      estado_resolucion:condiciones.estado,
      mensaje_resolucion:condiciones.mensaje,
    },
  };
});

const fallbackTable = () => ({ columnas:[{ id:'preview-column-1', titulo:'Columna 1', tipo:'texto', campo_origen:'' }], filas:[] });
const normalizeTable = value => {
  const columnas = Array.isArray(value?.columnas) ? value.columnas.filter(column => column?.id).map(column => ({ id:column.id, titulo:column.titulo || '', tipo:column.tipo === 'check' ? 'check' : 'texto', campo_origen:column.campo_origen || '' })) : [];
  const safeColumns = columnas.length ? columnas : fallbackTable().columnas;
  const filas = Array.isArray(value?.filas) ? value.filas.map((row, index) => ({ id:row?.id || `preview-row-${index}`, valores:Object.fromEntries(safeColumns.map(column => [column.id, row?.valores?.[column.id] ?? (column.tipo === 'check' ? false : '')])) })) : [];
  return { columnas:safeColumns, filas };
};
const renderTableText = (value, categoria, contexto) => (
  categoria && contexto !== null && contexto !== undefined
    ? renderTextoDocumental(value, categoria, contexto)
    : String(value ?? '')
);
const renderTableCell = (column, row, categoria, contexto) => {
  if (column.campo_origen && contexto?.item) return renderTextoDocumental(`{{item.${column.campo_origen}}}`, categoria, contexto);
  return renderTableText(row.valores[column.id], categoria, contexto);
};
const isRepeatUnit = unit => unit.kind === 'repeat-instance' || unit.kind === 'repeat-table-row';
const repeatTableChild = (block, bloques) => {
  const group = groupConfig(block);
  const children = orderDocumentPreviewBlocks(bloques.filter(item => item.bloque_padre_id === block.id));
  // Un título por ítem también es contenido repetido: no se compacta para no
  // cambiar el orden visual de grupos mixtos o de textos por ítem.
  if (group.titulo_item || children.length !== 1 || children[0].tipo_bloque !== 'tabla') return null;
  return normalizeTable(children[0].contenido_json).filas.length === 1 ? children[0] : null;
};

function PreviewTableHead({ table, categoria, contexto, measurementRef = null }) {
  return <thead ref={measurementRef}><tr>{table.columnas.map(columna => <th key={columna.id}>{renderTableText(columna.titulo, categoria, contexto)}</th>)}</tr></thead>;
}

function PreviewTableRow({ table, row, categoria, contexto, measurementRef = null }) {
  return <tr ref={measurementRef}>{table.columnas.map(columna => <td key={columna.id}>{columna.tipo === 'check' ? (row.valores[columna.id] ? '✓' : '') : renderTableCell(columna, row, categoria, contexto)}</td>)}</tr>;
}

const normalizeSectionColumns = value => {
  const source = Array.isArray(value?.columnas) ? value.columnas.slice(0, 3) : [{ id:'legacy-column-1', contenido_json:value }];
  const count = Math.max(1, source.length);
  return source.map((column, index) => ({ id:column?.id || `column-${index + 1}`, ancho:`${100 / count}%`, contenido_json:normalizeRichTextDocument(column?.contenido_json) }));
};

const groupConfig = block => ({ fuente_repeticion:'', fuente_repeticion_id:'', titulo_item:'', ...(block.contenido_json || {}) });
const itemIdentity = (item, index) => item?.id || item?.uuid || item?.codigo || index + 1;
export const previewGroupTitleKey = (unit, continuation) => `${unit.groupKey}:${continuation ? 'continuacion' : 'inicio'}`;

// Mantiene el comportamiento previo para grupos sin una fuente estructurada o
// cuando el editor administrativo no cuenta con datos transaccionales reales.
export const createDocumentPreviewFlowUnits = (bloques, categoria, contexto) => {
  const raiz = orderDocumentPreviewBlocks(bloques.filter(block => !block.bloque_padre_id));
  return raiz.flatMap(block => {
    const group = block.tipo_bloque === 'grupo_repetible' ? groupConfig(block) : null;
    const source = group ? getDocumentRepeatSource(categoria, group.fuente_repeticion_id) : null;
    const items = source ? getRepeatSourceItems(contexto, source.id) : null;
    if (!source || items === null) return [{ kind:'block', key:previewBlockKey(block), block }];
    const tableBlock = repeatTableChild(block, bloques);
    if (tableBlock) {
      const table = normalizeTable(tableBlock.contenido_json);
      const groupKey = previewBlockKey(block);
      const tableKey = `${groupKey}:table:${previewBlockKey(tableBlock)}`;
      return items.map((item, index) => ({
        kind:'repeat-table-row',
        key:`${tableKey}:item:${itemIdentity(item, index)}`,
        groupKey,
        tableKey,
        block,
        tableBlock,
        table,
        row:table.filas[0],
        item,
        index,
      }));
    }
    return items.map((item, index) => ({
      kind:'repeat-instance',
      key:`${previewBlockKey(block)}:item:${itemIdentity(item, index)}`,
      groupKey:previewBlockKey(block),
      block,
      item,
      index,
    }));
  });
};

export const paginateDocumentPreviewUnits = (unidades, encabezadoAlcance, pieAlcance, medidas) => {
  const resultado = [];
  let paginaActual = [];
  let altoUsado = 0;
  unidades.forEach(unit => {
    const colocar = () => {
      const anterior = paginaActual.at(-1)?.unit;
      const showGroupTitle = isRepeatUnit(unit) && anterior?.groupKey !== unit.groupKey;
      const showTableHeader = unit.kind === 'repeat-table-row' && anterior?.tableKey !== unit.tableKey;
      const continuation = showGroupTitle && unit.index > 0;
      const altoTitulo = showGroupTitle ? Number(medidas.titulosGrupo?.[previewGroupTitleKey(unit, continuation)] || 0) : 0;
      const altoEncabezadoTabla = showTableHeader ? Number(medidas.encabezadosTabla?.[unit.tableKey] || 0) : 0;
      return { unit, showGroupTitle, showTableHeader, continuation, alto: Number(medidas.unidades[unit.key] || 0) + altoTitulo + altoEncabezadoTabla };
    };
    let entry = colocar();
    let altoDisponible = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
    if (paginaActual.length && altoUsado + entry.alto > altoDisponible) {
      resultado.push(paginaActual);
      paginaActual = [];
      altoUsado = 0;
      entry = colocar();
      altoDisponible = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
    }
    paginaActual.push(entry);
    altoUsado += entry.alto;
  });
  if (paginaActual.length || !resultado.length) resultado.push(paginaActual);
  return resultado;
};

function VistaBloque({ block, bloques, categoria, contexto, measurementRef = null }) {
  const hijos = orderDocumentPreviewBlocks(bloques.filter(item => item.bloque_padre_id === block.id));
  const tabla = block.tipo_bloque === 'tabla' ? normalizeTable(block.contenido_json) : null;
  const grupo = block.tipo_bloque === 'grupo_repetible' ? groupConfig(block) : null;
  const condiciones = esBloqueCondicionesGenerales(block) ? block.contenido_json || {} : null;
  return <section ref={measurementRef} className="document-preview-block">
    {block.titulo && <h4>{block.titulo}</h4>}
    {block.tipo_bloque === 'texto_rico' && <DocumentPreviewRichText value={block.contenido_json} categoria={categoria} contexto={contexto} />}
    {tabla && <div className="document-preview-table-wrap"><table className="document-preview-table"><PreviewTableHead table={tabla} categoria={categoria} contexto={contexto} /><tbody>{tabla.filas.map(fila => <PreviewTableRow key={fila.id} table={tabla} row={fila} categoria={categoria} contexto={contexto} />)}</tbody></table></div>}
    {grupo && <div className="document-preview-repeat"><div className="document-preview-repeat-note">↻ Se repite por cada {grupo.fuente_repeticion || 'elemento'}</div>{grupo.titulo_item && <h4>{grupo.titulo_item}</h4>}{hijos.map(hijo => <VistaBloque key={hijo.client_key || hijo.id} block={hijo} bloques={bloques} categoria={categoria} contexto={contexto} />)}</div>}
    {condiciones && <VistaCondicionesGenerales condiciones={condiciones} categoria={categoria} contexto={contexto} />}
  </section>;
}

function VistaCondicionesGenerales({ condiciones, categoria, contexto }) {
  const segmentos = Array.isArray(condiciones.segmentos) ? condiciones.segmentos : [];
  const resuelto = condiciones.estado_resolucion === 'listo' || (!condiciones.estado_resolucion && Array.isArray(condiciones.segmentos));
  if (condiciones.estado_resolucion === 'cargando') return <div className="document-preview-conditions-message">Cargando condiciones generales…</div>;
  if (!resuelto) return <div className="document-preview-conditions-message">{condiciones.mensaje_resolucion || 'No se pudieron cargar las condiciones generales publicadas.'}</div>;
  return <div className="document-preview-conditions">{segmentos.map(segmento => <section key={segmento.id || segmento.orden} className="document-preview-conditions-segment">
    {segmento.titulo && <h4>{segmento.titulo}</h4>}
    <DocumentPreviewRichText value={segmento.contenido_json} categoria={categoria} contexto={contexto} />
  </section>)}</div>;
}

function GroupHeading({ unit, categoria, contexto, continuation = false, measurementRef = null }) {
  if (!unit.block.titulo) return null;
  const title = renderTableText(unit.block.titulo, categoria, contexto);
  return <h4 ref={measurementRef} className="document-preview-group-heading">{continuation ? `${title} (continuación)` : title}</h4>;
}

function VistaInstanciaRepetida({ unit, bloques, categoria, contexto, showGroupTitle, continuation, measurementRef = null }) {
  const grupo = groupConfig(unit.block);
  const hijos = orderDocumentPreviewBlocks(bloques.filter(item => item.bloque_padre_id === unit.block.id));
  const contextoItem = { ...(contexto || {}), item:unit.item };
  return <section ref={measurementRef} className="document-preview-block document-preview-repeat-instance">
    {showGroupTitle && <GroupHeading unit={unit} categoria={categoria} contexto={contextoItem} continuation={continuation} />}
    <div className="document-preview-repeat">
      {grupo.titulo_item && <h4>{renderTableText(grupo.titulo_item, categoria, contextoItem)}</h4>}
      {hijos.map(hijo => <VistaBloque key={hijo.client_key || hijo.id} block={hijo} bloques={bloques} categoria={categoria} contexto={contextoItem} />)}
    </div>
  </section>;
}

function VistaUnidadFlujo({ entry, bloques, categoria, contexto, measurementRef = null }) {
  const { unit } = entry;
  if (unit.kind === 'repeat-instance') return <VistaInstanciaRepetida unit={unit} bloques={bloques} categoria={categoria} contexto={contexto} showGroupTitle={entry.showGroupTitle} continuation={entry.continuation} measurementRef={measurementRef} />;
  if (unit.kind === 'repeat-table-row') return null;
  return <VistaBloque block={unit.block} bloques={bloques} categoria={categoria} contexto={contexto} measurementRef={measurementRef} />;
}

function VistaTablaRepetida({ entries, categoria, contexto }) {
  const first = entries[0];
  const { unit } = first;
  return <section className="document-preview-block document-preview-repeat-table">
    {first.showGroupTitle && <GroupHeading unit={unit} categoria={categoria} contexto={{ ...(contexto || {}), item:unit.item }} continuation={first.continuation} />}
    <div className="document-preview-table-wrap"><table className="document-preview-table">
      <PreviewTableHead table={unit.table} categoria={categoria} contexto={contexto} />
      <tbody>{entries.map(entry => <PreviewTableRow key={entry.unit.key} table={entry.unit.table} row={entry.unit.row} categoria={categoria} contexto={{ ...(contexto || {}), item:entry.unit.item }} />)}</tbody>
    </table></div>
  </section>;
}

function VistaPaginaFlujo({ entries, bloques, categoria, contexto }) {
  const fragments = [];
  for (let index = 0; index < entries.length;) {
    const entry = entries[index];
    if (entry.unit.kind !== 'repeat-table-row') {
      fragments.push(<VistaUnidadFlujo key={entry.unit.key} entry={entry} bloques={bloques} categoria={categoria} contexto={contexto} />);
      index += 1;
      continue;
    }
    const tableEntries = [entry];
    index += 1;
    while (index < entries.length && entries[index].unit.kind === 'repeat-table-row' && entries[index].unit.tableKey === entry.unit.tableKey) {
      tableEntries.push(entries[index]);
      index += 1;
    }
    fragments.push(<VistaTablaRepetida key={`${entry.unit.tableKey}:${entry.unit.key}`} entries={tableEntries} categoria={categoria} contexto={contexto} />);
  }
  return fragments;
}

function MedicionTablasRepetidas({ unidades, categoria, contexto, measureUnitRefs, measureTableHeaderRefs, measureTableWrapRefs }) {
  const tables = useMemo(() => {
    const byKey = new Map();
    unidades.filter(unit => unit.kind === 'repeat-table-row').forEach(unit => {
      const current = byKey.get(unit.tableKey) || [];
      current.push(unit);
      byKey.set(unit.tableKey, current);
    });
    return [...byKey.entries()];
  }, [unidades]);
  return tables.map(([tableKey, rows]) => {
    const first = rows[0];
    return <section key={tableKey} ref={node => { if (node) measureTableWrapRefs.current.set(tableKey, node); else measureTableWrapRefs.current.delete(tableKey); }} className="document-preview-block"><div className="document-preview-table-wrap"><table className="document-preview-table">
      <PreviewTableHead table={first.table} categoria={categoria} contexto={contexto} measurementRef={node => { if (node) measureTableHeaderRefs.current.set(tableKey, node); else measureTableHeaderRefs.current.delete(tableKey); }} />
      <tbody>{rows.map(unit => <PreviewTableRow key={unit.key} table={unit.table} row={unit.row} categoria={categoria} contexto={{ ...(contexto || {}), item:unit.item }} measurementRef={node => { if (node) measureUnitRefs.current.set(unit.key, node); else measureUnitRefs.current.delete(unit.key); }} />)}</tbody>
    </table></div></section>;
  });
}

function VistaSeccionPlantilla({ value, categoria, contexto }) {
  const columns = normalizeSectionColumns(value);
  return <div className="document-preview-columns" style={{gridTemplateColumns:columns.map(column => column.ancho).join(' ')}}>{columns.map(column => <div key={column.id} className="document-preview-column"><DocumentPreviewRichText value={column.contenido_json} categoria={categoria} contexto={contexto} /></div>)}</div>;
}

const measureNodeHeight = node => {
  if (!node) return 0;
  const styles = window.getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return rect.height + Number.parseFloat(styles.marginTop || 0) + Number.parseFloat(styles.marginBottom || 0);
};

// Sin contexto, conserva los tokens literales del editor administrativo.
export function DocumentPreviewSheet({ plantilla, bloques = [], categoria = 'cotizacion', contexto = null, zoom = 100, onZoom = () => {}, measurementOnly = false, onMeasurementsChange }) {
  const condicionesGenerales = useCondicionesGeneralesPublicadas(plantilla, bloques);
  const bloquesVistaPrevia = useMemo(() => bloquesConCondicionesResueltas(bloques, condicionesGenerales), [bloques, condicionesGenerales]);
  const unidades = useMemo(() => createDocumentPreviewFlowUnits(bloquesVistaPrevia, categoria, contexto), [bloquesVistaPrevia, categoria, contexto]);
  const measureSheetRef = useRef(null);
  const measureHeaderRef = useRef(null);
  const measureFooterRef = useRef(null);
  const measureUnitRefs = useRef(new Map());
  const measureGroupTitleRefs = useRef(new Map());
  const measureTableHeaderRefs = useRef(new Map());
  const measureTableWrapRefs = useRef(new Map());
  const [medidas, setMedidas] = useState(null);
  const encabezadoAlcance = normalizedPreviewScope(plantilla?.encabezado_alcance);
  const pieAlcance = normalizedPreviewScope(plantilla?.pie_alcance);
  const measurementKey = useMemo(() => previewMeasurementKey(plantilla, bloquesVistaPrevia, contexto, categoria), [plantilla, bloquesVistaPrevia, contexto, categoria]);
  const titleMeasurements = useMemo(() => unidades.filter(unit => isRepeatUnit(unit) && unit.block.titulo).filter((unit, index, list) => list.findIndex(item => item.groupKey === unit.groupKey) === index), [unidades]);

  useLayoutEffect(() => {
    let activo = true;
    const medir = () => {
      if (!activo) return;
      const unitHeights = Object.fromEntries(unidades.map(unit => [unit.key, measureNodeHeight(measureUnitRefs.current.get(unit.key))]));
      const titleHeights = Object.fromEntries(titleMeasurements.flatMap(unit => ([
        [previewGroupTitleKey(unit, false), measureNodeHeight(measureGroupTitleRefs.current.get(previewGroupTitleKey(unit, false)))],
        [previewGroupTitleKey(unit, true), measureNodeHeight(measureGroupTitleRefs.current.get(previewGroupTitleKey(unit, true)))],
      ])));
      const tableHeaderHeights = Object.fromEntries([...measureTableHeaderRefs.current.keys()].map(tableKey => {
        const headerHeight = measureNodeHeight(measureTableHeaderRefs.current.get(tableKey));
        const rowHeight = unidades.filter(unit => unit.kind === 'repeat-table-row' && unit.tableKey === tableKey).reduce((sum, unit) => sum + measureNodeHeight(measureUnitRefs.current.get(unit.key)), 0);
        const tableHeight = measureNodeHeight(measureTableWrapRefs.current.get(tableKey));
        return [tableKey, headerHeight + Math.max(0, tableHeight - headerHeight - rowHeight)];
      }));
      const footerStyles = measureFooterRef.current ? window.getComputedStyle(measureFooterRef.current) : null;
      const next = {
        key:measurementKey,
        bloques:Object.fromEntries(unidades.filter(unit => unit.kind === 'block').map(unit => [unit.key, unitHeights[unit.key]])),
        unidades:unitHeights,
        titulosGrupo:titleHeights,
        encabezadosTabla:tableHeaderHeights,
        encabezado:measureHeaderRef.current?.getBoundingClientRect().height || 0,
        pie:(measureFooterRef.current?.getBoundingClientRect().height || 0) + Number.parseFloat(footerStyles?.marginTop || 0),
      };
      setMedidas(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const frame = window.requestAnimationFrame(medir);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    [measureSheetRef.current, measureHeaderRef.current, measureFooterRef.current, ...measureUnitRefs.current.values(), ...measureGroupTitleRefs.current.values(), ...measureTableHeaderRefs.current.values(), ...measureTableWrapRefs.current.values()].filter(Boolean).forEach(node => observer?.observe(node));
    document.fonts?.ready?.then(medir);
    return () => { activo = false; window.cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [measurementKey, unidades, titleMeasurements]);

  useEffect(() => { onMeasurementsChange?.(medidas); }, [medidas, onMeasurementsChange]);

  const todasLasAlturasMedidas = medidas?.key === measurementKey && unidades.every(unit => Number(medidas.unidades?.[unit.key]) > 0);
  const paginas = useMemo(() => {
    if (!todasLasAlturasMedidas) return [unidades.map(unit => ({ unit, showGroupTitle:isRepeatUnit(unit) && unit.index === 0, showTableHeader:unit.kind === 'repeat-table-row', continuation:false }))];
    return paginateDocumentPreviewUnits(unidades, encabezadoAlcance, pieAlcance, medidas);
  }, [todasLasAlturasMedidas, unidades, encabezadoAlcance, pieAlcance, medidas]);

  const instanciasSobredimensionadas = useMemo(() => {
    if (!todasLasAlturasMedidas) return [];
    const capacidadMaxima = Math.max(previewPageCapacity(0, encabezadoAlcance, pieAlcance, medidas), previewPageCapacity(1, encabezadoAlcance, pieAlcance, medidas));
    return unidades.filter(unit => isRepeatUnit(unit)).filter(unit => {
      const titulo = Math.max(Number(medidas.titulosGrupo?.[previewGroupTitleKey(unit, false)] || 0), Number(medidas.titulosGrupo?.[previewGroupTitleKey(unit, true)] || 0));
      const encabezadoTabla = unit.kind === 'repeat-table-row' ? Number(medidas.encabezadosTabla?.[unit.tableKey] || 0) : 0;
      return Number(medidas.unidades?.[unit.key] || 0) + titulo + encabezadoTabla > capacidadMaxima;
    });
  }, [todasLasAlturasMedidas, unidades, encabezadoAlcance, pieAlcance, medidas]);

  const medicion = <div className="document-preview-measure" aria-hidden="true"><article ref={measureSheetRef} className="document-preview-sheet">
    <header ref={measureHeaderRef} className="document-preview-header"><VistaSeccionPlantilla value={plantilla?.encabezado_json} categoria={categoria} contexto={contexto} /></header>
    <main className="document-preview-body">{unidades.filter(unit => unit.kind !== 'repeat-table-row').map(unit => <VistaUnidadFlujo key={unit.key} entry={{ unit, showGroupTitle:false, continuation:false }} measurementRef={node => { if (node) measureUnitRefs.current.set(unit.key, node); else measureUnitRefs.current.delete(unit.key); }} bloques={bloquesVistaPrevia} categoria={categoria} contexto={contexto} />)}<MedicionTablasRepetidas unidades={unidades} categoria={categoria} contexto={contexto} measureUnitRefs={measureUnitRefs} measureTableHeaderRefs={measureTableHeaderRefs} measureTableWrapRefs={measureTableWrapRefs} />{titleMeasurements.flatMap(unit => [false, true].map(continuation => <GroupHeading key={previewGroupTitleKey(unit, continuation)} unit={unit} categoria={categoria} contexto={{ ...(contexto || {}), item:unit.item }} continuation={continuation} measurementRef={node => { if (node) measureGroupTitleRefs.current.set(previewGroupTitleKey(unit, continuation), node); else measureGroupTitleRefs.current.delete(previewGroupTitleKey(unit, continuation)); }} />))}</main>
    <footer ref={measureFooterRef} className="document-preview-footer"><VistaSeccionPlantilla value={plantilla?.pie_json} categoria={categoria} contexto={contexto} /></footer>
  </article></div>;

  if (measurementOnly) return medicion;

  return <div className="document-preview">
    <div className="document-preview-toolbar"><span className="text-muted">Vista previa</span><div className="row" style={{gap:6}}><button type="button" className="btn btn-ghost" onClick={() => onZoom(zoom - 10)} disabled={zoom <= 50} aria-label="Alejar">−</button><span className="document-preview-zoom">{zoom}%</span><button type="button" className="btn btn-ghost" onClick={() => onZoom(zoom + 10)} disabled={zoom >= 150} aria-label="Acercar">+</button></div></div>
    {instanciasSobredimensionadas.length > 0 && <div className="alert alert-warning" style={{margin:'0 0 12px'}}><strong>Atención:</strong> {instanciasSobredimensionadas.map(unit => `El ítem ${unit.index + 1}${unit.block.titulo ? ` de ${unit.block.titulo}` : ''} es más alto que una página y no se dividirá.`).join(' ')}</div>}
    <div className="document-preview-stage" style={{'--document-preview-scale': zoom / 100}}><div className="document-preview-pages">{paginas.map((pagina, index) => {
      const mostrarEncabezado = index === 0 || encabezadoAlcance === 'todas';
      const mostrarPie = index === 0 || pieAlcance === 'todas';
      return <div key={`pagina-${index}`} className="document-preview-sheet-frame"><article className="document-preview-sheet" aria-label={`Vista previa de documento, página ${index + 1}`}>
        {mostrarEncabezado && <header className="document-preview-header"><VistaSeccionPlantilla value={plantilla?.encabezado_json} categoria={categoria} contexto={contexto} /></header>}
        <main className="document-preview-body"><VistaPaginaFlujo entries={pagina} bloques={bloquesVistaPrevia} categoria={categoria} contexto={contexto} /></main>
        {mostrarPie && <footer className="document-preview-footer"><VistaSeccionPlantilla value={plantilla?.pie_json} categoria={categoria} contexto={contexto} /></footer>}
      </article></div>;
    })}</div>{medicion}</div>
  </div>;
}

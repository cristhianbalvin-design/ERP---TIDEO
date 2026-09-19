import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeRichTextDocument } from './RichTextEditor.jsx';
import { DocumentPreviewRichText } from './DocumentPreviewRichText.jsx';
import { renderTextoDocumental } from '../lib/variablesDocumentales.js';
import { getDocumentRepeatSource, getRepeatSourceItems } from '../lib/documentRepeatSources.js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { hasLayoutColumns, normalizeLayoutColumns } from './DocumentLayoutColumns.jsx';

const TABLE_FONT_SIZES = new Set(['10px', '12px', '14px', '18px', '24px']);
const normalizeTableFormat = value => ({
  negrita:value?.negrita === true ? true : null,
  cursiva:value?.cursiva === true,
  subrayado:value?.subrayado === true,
  tamano_fuente:TABLE_FONT_SIZES.has(value?.tamano_fuente) ? value.tamano_fuente : null,
});
const tableFormatStyle = value => {
  const format = normalizeTableFormat(value);
  return {
    ...(format.negrita ? { '--document-table-font-weight':700 } : {}),
    ...(format.cursiva ? { '--document-table-font-style':'italic' } : {}),
    ...(format.subrayado ? { '--document-table-text-decoration':'underline' } : {}),
    ...(format.tamano_fuente ? { '--document-table-font-size':format.tamano_fuente } : {}),
  };
};

export const PREVIEW_SHEET_HEIGHT = 1056;
// Debe reflejar el padding vertical total de .document-preview-sheet (40px × 2).
export const PREVIEW_SHEET_VERTICAL_PADDING = 80;
export const PREVIEW_BODY_TOP_PADDING = 0;
// Evita que una suma de alturas fraccionarias "case" en el último píxel y
// termine mostrando media línea bajo el recorte físico de la hoja.
export const PREVIEW_PAGE_FIT_EPSILON = 2;

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
const estadoCondicionesSinConfigurar = { estado:'sin_configuracion', segmentos:[], mensaje:'Selecciona qué Documento de Condiciones usar para este bloque.' };
const estadoCondicionesCargando = { estado:'cargando', segmentos:[], mensaje:'' };

function useCondicionesGeneralesPublicadas(plantilla, bloques) {
  const requiereResolucion = bloques.some(bloque => esBloqueCondicionesGenerales(bloque) && !tieneCondicionesMaterializadas(bloque));
  const tiposSeleccionados = useMemo(() => [...new Set(bloques
    .filter(bloque => esBloqueCondicionesGenerales(bloque) && !tieneCondicionesMaterializadas(bloque))
    .map(bloque => bloque.contenido_json?.condiciones_tipo_documento_id)
    .filter(Boolean))].sort(), [bloques]);
  const tiposSeleccionadosKey = tiposSeleccionados.join(',');
  const [estadosPorTipo, setEstadosPorTipo] = useState({});

  useEffect(() => {
    if (!requiereResolucion) {
      setEstadosPorTipo({});
      return;
    }
    if (!tiposSeleccionados.length) {
      setEstadosPorTipo({});
      return;
    }
    if (!isSupabaseConfigured() || !plantilla?.empresa_id) {
      setEstadosPorTipo(Object.fromEntries(tiposSeleccionados.map(tipoId => [tipoId, { estado:'error', segmentos:[], mensaje:'No se pudo identificar la plantilla para resolver las condiciones generales.' }])));
      return;
    }
    let activo = true;
    setEstadosPorTipo(Object.fromEntries(tiposSeleccionados.map(tipoId => [tipoId, estadoCondicionesCargando])));
    (async () => {
      try {
        const sb = await getSupabaseClient();
        const resultados = await Promise.all(tiposSeleccionados.map(async tipoDocumentoId => {
          let bibliotecaQuery = sb
            .from('biblioteca_condiciones_generales')
            .select('id')
            .eq('empresa_id', plantilla.empresa_id)
            .eq('tipo_documento_id', tipoDocumentoId)
            .eq('estado', 'publicada')
            .order('version', { ascending:false })
            .limit(1);
          bibliotecaQuery = plantilla.sociedad_id
            ? bibliotecaQuery.eq('sociedad_id', plantilla.sociedad_id)
            : bibliotecaQuery.is('sociedad_id', null);
          const { data:bibliotecas, error:bibliotecaError } = await bibliotecaQuery;
          if (bibliotecaError) throw bibliotecaError;
          const biblioteca = bibliotecas?.[0];
          if (!biblioteca) return [tipoDocumentoId, { estado:'sin_biblioteca', segmentos:[], mensaje:'El Documento de Condiciones seleccionado no tiene una versión publicada.' }];
          const { data:segmentos, error:segmentosError } = await sb
            .from('condiciones_generales_segmentos')
            .select('id,titulo,contenido_json,contenido_texto_plano,orden')
            .eq('condiciones_generales_id', biblioteca.id)
            .eq('activo', true)
            .order('orden');
          if (segmentosError) throw segmentosError;
          return [tipoDocumentoId, (segmentos || []).length
            ? { estado:'listo', segmentos:segmentos || [], mensaje:'' }
            : { estado:'sin_segmentos', segmentos:[], mensaje:'El Documento de Condiciones seleccionado no tiene segmentos activos.' }];
        }));
        if (activo) setEstadosPorTipo(Object.fromEntries(resultados));
      } catch (error) {
        if (activo) setEstadosPorTipo(Object.fromEntries(tiposSeleccionados.map(tipoId => [tipoId, { estado:'error', segmentos:[], mensaje:'No se pudo cargar el Documento de Condiciones seleccionado.' }])));
      }
    })();
    return () => { activo = false; };
  }, [requiereResolucion, tiposSeleccionadosKey, plantilla?.empresa_id, plantilla?.sociedad_id]);

  return estadosPorTipo;
}

const bloquesConCondicionesResueltas = (bloques, estadosPorTipo) => bloques.map(bloque => {
  if (!esBloqueCondicionesGenerales(bloque) || tieneCondicionesMaterializadas(bloque)) return bloque;
  const tipoDocumentoId = bloque.contenido_json?.condiciones_tipo_documento_id;
  const condiciones = tipoDocumentoId ? estadosPorTipo[tipoDocumentoId] || estadoCondicionesCargando : estadoCondicionesSinConfigurar;
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
  // Las tablas creadas antes del control no tienen este campo y deben seguir
  // mostrando encabezado, tal como se guardaron originalmente.
  const formatosExistentes = value?.formato_columnas && typeof value.formato_columnas === 'object' ? value.formato_columnas : {};
  return {
    columnas:safeColumns,
    filas,
    mostrar_encabezado:value?.mostrar_encabezado !== false,
    formato_encabezado:normalizeTableFormat(value?.formato_encabezado),
    formato_columnas:Object.fromEntries(safeColumns.map(column => [
      column.id,
      normalizeTableFormat(formatosExistentes[column.id] ?? value?.formato_cuerpo),
    ])),
  };
};
const normalizeTableSections = value => normalizeLayoutColumns(value, normalizeTable);
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
  // Dos secciones son dos tablas independientes: se renderizan dentro de cada
  // instancia repetida, en vez de forzarlas al optimizador de una sola tabla.
  if (hasLayoutColumns(children[0].contenido_json)) return null;
  return normalizeTable(children[0].contenido_json).filas.length === 1 ? children[0] : null;
};

function PreviewTableHead({ table, categoria, contexto, measurementRef = null }) {
  if (!table.mostrar_encabezado) return null;
  return <thead ref={measurementRef} className="document-preview-table-format" style={tableFormatStyle(table.formato_encabezado)}><tr>{table.columnas.map(columna => <th key={columna.id}>{renderTableText(columna.titulo, categoria, contexto)}</th>)}</tr></thead>;
}

function PreviewTableRow({ table, row, categoria, contexto, measurementRef = null }) {
  return <tr ref={measurementRef}>{table.columnas.map(columna => {
    const format = columna.tipo === 'texto' ? table.formato_columnas?.[columna.id] : null;
    return <td key={columna.id} className={format ? 'document-preview-table-format' : undefined} style={format ? tableFormatStyle(format) : undefined}>{columna.tipo === 'check' ? (row.valores[columna.id] ? '✓' : '') : renderTableCell(columna, row, categoria, contexto)}</td>;
  })}</tr>;
}

const normalizeSectionColumns = value => normalizeLayoutColumns(value, normalizeRichTextDocument);

const groupConfig = block => ({ fuente_repeticion:'', fuente_repeticion_id:'', titulo_item:'', ...(block.contenido_json || {}) });
const itemIdentity = (item, index) => item?.id || item?.uuid || item?.codigo || index + 1;
export const previewGroupTitleKey = (unit, continuation) => `${unit.groupKey}:${continuation ? 'continuacion' : 'inicio'}`;
export const previewTextBlockTitleKey = (unit, continuation) => `${unit.textBlockKey}:${continuation ? 'continuacion' : 'inicio'}`;
export const previewConditionsTitleKey = (unit, continuation) => `${unit.conditionsBlockKey}:${continuation ? 'continuacion' : 'inicio'}`;

const isRichTextFlowUnit = unit => unit.kind === 'rich-text-node' || unit.kind === 'rich-text-columns-fragment';
const isRichTextColumnsStream = unit => unit.kind === 'rich-text-columns-stream';
const isConditionsSegmentUnit = unit => unit.kind === 'conditions-segment';
const richTextNodeKey = (blockKey, columnId, index) => `${blockKey}:rich-text:${columnId}:${index}`;
const richTextNodes = value => {
  const document = normalizeRichTextDocument(value);
  const nodes = Array.isArray(document?.content) ? document.content : [];
  return nodes.length ? nodes : [{ type:'paragraph', content:[] }];
};
const isIntentionallyEmptyRichTextNode = node => node?.type === 'paragraph' && (!Array.isArray(node.content) || node.content.length === 0);
const richTextNodeDocument = node => ({ type:'doc', content:[node] });
const richTextParagraphGap = (nodes, index) => nodes[index]?.type === 'paragraph' && index < nodes.length - 1 ? 8 : 0;
const richTextBlockUnits = block => {
  const blockKey = previewBlockKey(block);
  if (hasLayoutColumns(block.contenido_json)) {
    return [{
      kind:'rich-text-columns-stream',
      key:`${blockKey}:rich-text-columns`,
      textBlockKey:blockKey,
      block,
      columns:normalizeLayoutColumns(block.contenido_json, normalizeRichTextDocument).map(column => ({
        ...column,
        nodes:richTextNodes(column.contenido_json),
      })),
    }];
  }
  const nodes = richTextNodes(block.contenido_json);
  return nodes.map((node, index) => ({
    kind:'rich-text-node',
    key:richTextNodeKey(blockKey, 'legacy', index),
    textBlockKey:blockKey,
    block,
    node,
    index,
    isLast:index === nodes.length - 1,
    paragraphIndex:node?.type === 'paragraph' ? nodes.slice(0, index + 1).filter(item => item?.type === 'paragraph').length : null,
  }));
};

const conditionsSegmentUnits = block => {
  const blockKey = previewBlockKey(block);
  const segmentos = Array.isArray(block.contenido_json?.segmentos) ? block.contenido_json.segmentos : [];
  if (!segmentos.length) return [{ kind:'block', key:blockKey, block }];
  return segmentos.map((segment, index) => ({
    kind:'conditions-segment',
    key:`${blockKey}:conditions-segment:${segment.id || segment.orden || index}`,
    conditionsBlockKey:blockKey,
    block,
    segment,
    index,
    isLast:index === segmentos.length - 1,
  }));
};

// Mantiene el comportamiento previo para grupos sin una fuente estructurada o
// cuando el editor administrativo no cuenta con datos transaccionales reales.
export const createDocumentPreviewFlowUnits = (bloques, categoria, contexto) => {
  const raiz = orderDocumentPreviewBlocks(bloques.filter(block => !block.bloque_padre_id));
  return raiz.flatMap(block => {
    if (block.tipo_bloque === 'texto_rico') return richTextBlockUnits(block);
    if (esBloqueCondicionesGenerales(block)) return conditionsSegmentUnits(block);
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

const textBlockHeadingHeight = (unit, continuation, medidas) => unit.block?.titulo
  ? Number(medidas.titulosTextoRico?.[previewTextBlockTitleKey(unit, continuation)] || 0)
  : 0;

const richTextColumnRangeHeight = (stream, column, start, end, medidas) => {
  let height = 0;
  for (let index = start; index < end; index += 1) {
    height += Number(medidas.nodosTextoRico?.[richTextNodeKey(stream.textBlockKey, column.id, index)] || 0);
    height += (richTextParagraphGap(column.nodes, index) && index < end - 1) ? 8 : 0;
  }
  return height;
};

const nextRichTextColumnsFragment = (stream, cursors, maxHeight, medidas, fragmentIndex) => {
  const ranges = stream.columns.map((column, columnIndex) => {
    const start = cursors[columnIndex];
    let end = start;
    while (end < column.nodes.length) {
      const nextHeight = richTextColumnRangeHeight(stream, column, start, end + 1, medidas);
      if (end > start && nextHeight > maxHeight) break;
      end += 1;
      if (nextHeight > maxHeight) break;
    }
    return { start, end };
  });
  return {
    kind:'rich-text-columns-fragment',
    key:`${stream.key}:fragment:${fragmentIndex}`,
    textBlockKey:stream.textBlockKey,
    block:stream.block,
    columns:stream.columns,
    ranges,
    index:fragmentIndex,
    isLast:ranges.every((range, columnIndex) => range.end >= stream.columns[columnIndex].nodes.length),
    height:Math.max(0, ...ranges.map((range, columnIndex) => richTextColumnRangeHeight(stream, stream.columns[columnIndex], range.start, range.end, medidas))),
  };
};

const textFlowEntry = (unit, paginaActual, medidas) => {
  const previous = paginaActual.at(-1)?.unit;
  const showTextTitle = Boolean(unit.block?.titulo) && previous?.textBlockKey !== unit.textBlockKey;
  const continuation = showTextTitle && unit.index > 0;
  const titleHeight = showTextTitle ? textBlockHeadingHeight(unit, continuation, medidas) : 0;
  const contentHeight = unit.kind === 'rich-text-columns-fragment'
    ? unit.height + (unit.isLast ? 10 : 0)
    : Number(medidas.unidades?.[unit.key] || 0);
  return { unit, showTextTitle, continuation, alto:contentHeight + titleHeight };
};

const conditionsFlowEntry = (unit, paginaActual, medidas) => {
  const previous = paginaActual.at(-1)?.unit;
  const showConditionsTitle = Boolean(unit.block?.titulo) && previous?.conditionsBlockKey !== unit.conditionsBlockKey;
  const continuation = showConditionsTitle && unit.index > 0;
  const titleHeight = showConditionsTitle
    ? Number(medidas.titulosCondiciones?.[previewConditionsTitleKey(unit, continuation)] || 0)
    : 0;
  return {
    unit,
    showConditionsTitle,
    continuation,
    alto:Number(medidas.unidades?.[unit.key] || 0) + titleHeight,
  };
};

const richTextOversizedNodes = (unidades, encabezadoAlcance, pieAlcance, medidas) => {
  const capacity = Math.max(
    previewPageCapacity(0, encabezadoAlcance, pieAlcance, medidas),
    previewPageCapacity(1, encabezadoAlcance, pieAlcance, medidas),
  );
  const descriptors = [];
  const add = ({ block, blockKey, node, index, paragraphIndex, height }) => {
    const title = block?.titulo ? Math.max(
      Number(medidas.titulosTextoRico?.[`${blockKey}:inicio`] || 0),
      Number(medidas.titulosTextoRico?.[`${blockKey}:continuacion`] || 0),
    ) : 0;
    if (height + title <= capacity) return;
    descriptors.push({
      blockKey,
      nodeType:node?.type || 'elemento',
      index,
      paragraphIndex,
      blockTitle:block?.titulo || '',
    });
  };
  unidades.forEach(unit => {
    if (unit.kind === 'rich-text-node') {
      add({ block:unit.block, blockKey:unit.textBlockKey, node:unit.node, index:unit.index, paragraphIndex:unit.paragraphIndex, height:Number(medidas.unidades?.[unit.key] || 0) });
    }
    if (isRichTextColumnsStream(unit)) unit.columns.forEach(column => {
      let paragraphIndex = 0;
      column.nodes.forEach((node, index) => {
        if (node?.type === 'paragraph') paragraphIndex += 1;
        add({ block:unit.block, blockKey:unit.textBlockKey, node, index, paragraphIndex:node?.type === 'paragraph' ? paragraphIndex : null, height:Number(medidas.nodosTextoRico?.[richTextNodeKey(unit.textBlockKey, column.id, index)] || 0) });
      });
    });
  });
  return descriptors;
};

export const paginateDocumentPreviewUnits = (unidades, encabezadoAlcance, pieAlcance, medidas) => {
  const resultado = [];
  let paginaActual = [];
  let altoUsado = 0;
  const cerrarPagina = () => {
    resultado.push(paginaActual);
    paginaActual = [];
    altoUsado = 0;
  };
  for (const unit of unidades) {
    if (isRichTextColumnsStream(unit)) {
      const cursors = unit.columns.map(() => 0);
      let fragmentIndex = 0;
      while (cursors.some((cursor, columnIndex) => cursor < unit.columns[columnIndex].nodes.length)) {
        const createEntry = () => {
          const continuation = fragmentIndex > 0;
          const showTextTitle = Boolean(unit.block?.titulo) && paginaActual.at(-1)?.unit?.textBlockKey !== unit.textBlockKey;
          const titleHeight = showTextTitle ? textBlockHeadingHeight({ ...unit, index:fragmentIndex }, continuation, medidas) : 0;
          const pageCapacity = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
          // Reserva el mismo espacio final que tenía un bloque completo para
          // que el último fragmento no desborde al siguiente bloque.
          const fragment = nextRichTextColumnsFragment(unit, cursors, Math.max(0, pageCapacity - altoUsado - titleHeight - 10 - PREVIEW_PAGE_FIT_EPSILON), medidas, fragmentIndex);
          return { unit:fragment, showTextTitle, continuation, alto:fragment.height + (fragment.isLast ? 10 : 0) + titleHeight };
        };
        let entry = createEntry();
        let pageCapacity = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
        // Una unidad indivisible nunca se agrega a una página que ya no tiene
        // espacio suficiente. Si la unidad sola excede una página vacía, se
        // conserva como caso excepcional y la UI lo advierte explícitamente;
        // así no se entra en un ciclo de paginación infinito.
        if (paginaActual.length && altoUsado + entry.alto + PREVIEW_PAGE_FIT_EPSILON > pageCapacity) {
          cerrarPagina();
          entry = createEntry();
          pageCapacity = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
        }
        paginaActual.push(entry);
        altoUsado += entry.alto;
        entry.unit.ranges.forEach((range, index) => { cursors[index] = range.end; });
        fragmentIndex += 1;
        if (!entry.unit.isLast) cerrarPagina();
      }
      continue;
    }
    const colocar = () => {
      if (isRichTextFlowUnit(unit)) return textFlowEntry(unit, paginaActual, medidas);
      if (isConditionsSegmentUnit(unit)) return conditionsFlowEntry(unit, paginaActual, medidas);
      const anterior = paginaActual.at(-1)?.unit;
      const showGroupTitle = isRepeatUnit(unit) && anterior?.groupKey !== unit.groupKey;
      const showTableHeader = unit.kind === 'repeat-table-row' && unit.table.mostrar_encabezado && anterior?.tableKey !== unit.tableKey;
      const continuation = showGroupTitle && unit.index > 0;
      const altoTitulo = showGroupTitle ? Number(medidas.titulosGrupo?.[previewGroupTitleKey(unit, continuation)] || 0) : 0;
      const altoEncabezadoTabla = showTableHeader ? Number(medidas.encabezadosTabla?.[unit.tableKey] || 0) : 0;
      return { unit, showGroupTitle, showTableHeader, continuation, alto: Number(medidas.unidades[unit.key] || 0) + altoTitulo + altoEncabezadoTabla };
    };
    let entry = colocar();
    let altoDisponible = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
    // El margen evita que el redondeo/reflow del DOM deje media línea bajo el
    // overflow:hidden de la hoja aunque la suma nominal parezca caber.
    if (paginaActual.length && altoUsado + entry.alto + PREVIEW_PAGE_FIT_EPSILON > altoDisponible) {
      cerrarPagina();
      entry = colocar();
      altoDisponible = previewPageCapacity(resultado.length, encabezadoAlcance, pieAlcance, medidas);
    }
    paginaActual.push(entry);
    altoUsado += entry.alto;
  }
  if (paginaActual.length || !resultado.length) resultado.push(paginaActual);
  return resultado;
};

function VistaBloque({ block, bloques, categoria, contexto, measurementRef = null }) {
  const hijos = orderDocumentPreviewBlocks(bloques.filter(item => item.bloque_padre_id === block.id));
  const tablaConSecciones = block.tipo_bloque === 'tabla' && hasLayoutColumns(block.contenido_json);
  const tabla = block.tipo_bloque === 'tabla' && !tablaConSecciones ? normalizeTable(block.contenido_json) : null;
  const seccionesTabla = tablaConSecciones ? normalizeTableSections(block.contenido_json) : [];
  const grupo = block.tipo_bloque === 'grupo_repetible' ? groupConfig(block) : null;
  const condiciones = esBloqueCondicionesGenerales(block) ? block.contenido_json || {} : null;
  const textoConColumnas = block.tipo_bloque === 'texto_rico' && hasLayoutColumns(block.contenido_json);
  const columnasTexto = textoConColumnas ? normalizeLayoutColumns(block.contenido_json, normalizeRichTextDocument) : [];
  return <section ref={measurementRef} className="document-preview-block">
    {block.titulo && <h4>{block.titulo}</h4>}
    {block.tipo_bloque === 'texto_rico' && (textoConColumnas
      ? <div className="document-preview-columns" style={{gridTemplateColumns:columnasTexto.map(column => column.ancho).join(' ')}}>{columnasTexto.map(column => <div key={column.id} className="document-preview-column"><DocumentPreviewRichText value={column.contenido_json} categoria={categoria} contexto={contexto} /></div>)}</div>
      : <DocumentPreviewRichText value={block.contenido_json} categoria={categoria} contexto={contexto} />)}
    {tabla && <div className="document-preview-table-wrap"><table className="document-preview-table"><PreviewTableHead table={tabla} categoria={categoria} contexto={contexto} /><tbody>{tabla.filas.map(fila => <PreviewTableRow key={fila.id} table={tabla} row={fila} categoria={categoria} contexto={contexto} />)}</tbody></table></div>}
    {seccionesTabla.length > 0 && <div className="document-preview-columns" style={{gridTemplateColumns:seccionesTabla.map(section => section.ancho).join(' ')}}>{seccionesTabla.map(section => {
      const table = normalizeTable(section.contenido_json);
      return <div key={section.id} className="document-preview-column"><div className="document-preview-table-wrap"><table className="document-preview-table"><PreviewTableHead table={table} categoria={categoria} contexto={contexto} /><tbody>{table.filas.map(fila => <PreviewTableRow key={fila.id} table={table} row={fila} categoria={categoria} contexto={contexto} />)}</tbody></table></div></div>;
    })}</div>}
    {grupo && <div className="document-preview-repeat"><div className="document-preview-repeat-note">↻ Se repite por cada {grupo.fuente_repeticion || 'elemento'}</div>{grupo.titulo_item && <h4>{grupo.titulo_item}</h4>}{hijos.map(hijo => <VistaBloque key={hijo.client_key || hijo.id} block={hijo} bloques={bloques} categoria={categoria} contexto={contexto} />)}</div>}
    {condiciones && <VistaCondicionesGenerales condiciones={condiciones} categoria={categoria} contexto={contexto} />}
  </section>;
}

function TextBlockHeading({ unit, categoria, contexto, continuation = false, measurementRef = null }) {
  if (!unit.block?.titulo) return null;
  const title = renderTableText(unit.block.titulo, categoria, contexto);
  return <h4 ref={measurementRef} className="document-preview-text-block-heading">{continuation ? `${title} (continuación)` : title}</h4>;
}

function RichTextFlowNode({ node, categoria, contexto, addParagraphGap = false, measurementRef = null }) {
  return <div ref={measurementRef} className="document-preview-rich-text-flow-node" style={{marginBottom:addParagraphGap ? 8 : 0}}>
    <DocumentPreviewRichText value={richTextNodeDocument(node)} categoria={categoria} contexto={contexto} />
  </div>;
}

function RichTextFlowNodes({ nodes, start = 0, end = nodes.length, categoria, contexto, measurementRefForNode = null, includeParagraphGaps = true }) {
  return <>{nodes.slice(start, end).map((node, offset) => {
    const index = start + offset;
    return <RichTextFlowNode key={index} node={node} categoria={categoria} contexto={contexto} addParagraphGap={includeParagraphGaps && richTextParagraphGap(nodes, index) > 0 && index < end - 1} measurementRef={measurementRefForNode?.(index)} />;
  })}</>;
}

function VistaTextoRicoFlujo({ unit, categoria, contexto, showTextTitle = false, continuation = false, measurementRef = null }) {
  const isColumnsFragment = unit.kind === 'rich-text-columns-fragment';
  return <section ref={measurementRef} className={`document-preview-rich-text-flow${unit.isLast ? ' document-preview-rich-text-flow-final' : ''}`}>
    {showTextTitle && <TextBlockHeading unit={unit} categoria={categoria} contexto={contexto} continuation={continuation} />}
    {isColumnsFragment
      ? <div className="document-preview-columns" style={{gridTemplateColumns:unit.columns.map(column => column.ancho).join(' ')}}>{unit.columns.map((column, columnIndex) => {
        const range = unit.ranges[columnIndex];
        return <div key={column.id} className="document-preview-column"><RichTextFlowNodes nodes={column.nodes} start={range.start} end={range.end} categoria={categoria} contexto={contexto} /></div>;
      })}</div>
      : <RichTextFlowNode node={unit.node} categoria={categoria} contexto={contexto} addParagraphGap={!unit.isLast && unit.node?.type === 'paragraph'} />}
  </section>;
}

function MedicionTextoRicoColumnas({ unit, categoria, contexto, measureNodeRefs }) {
  return <section className="document-preview-rich-text-flow"><div className="document-preview-columns" style={{gridTemplateColumns:unit.columns.map(column => column.ancho).join(' ')}}>{unit.columns.map(column => <div key={column.id} className="document-preview-column"><RichTextFlowNodes nodes={column.nodes} categoria={categoria} contexto={contexto} includeParagraphGaps={false} measurementRefForNode={index => node => {
    const key = richTextNodeKey(unit.textBlockKey, column.id, index);
    if (node) measureNodeRefs.current.set(key, node); else measureNodeRefs.current.delete(key);
  }} /></div>)}</div></section>;
}

function ConditionsHeading({ unit, categoria, contexto, continuation = false, measurementRef = null }) {
  if (!unit.block?.titulo) return null;
  const title = renderTableText(unit.block.titulo, categoria, contexto);
  return <h4 ref={measurementRef} className="document-preview-text-block-heading document-preview-conditions-heading">{continuation ? `${title} (continuación)` : title}</h4>;
}

function VistaCondicionesSegmento({ unit, categoria, contexto, showConditionsTitle = false, continuation = false, measurementRef = null }) {
  return <section ref={measurementRef} className="document-preview-block document-preview-conditions-segment">
    {showConditionsTitle && <ConditionsHeading unit={unit} categoria={categoria} contexto={contexto} continuation={continuation} />}
    {unit.segment.titulo && <h4>{unit.segment.titulo}</h4>}
    <DocumentPreviewRichText value={unit.segment.contenido_json} categoria={categoria} contexto={contexto} />
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
  if (isRichTextFlowUnit(unit)) return <VistaTextoRicoFlujo unit={unit} categoria={categoria} contexto={contexto} showTextTitle={entry.showTextTitle} continuation={entry.continuation} measurementRef={measurementRef} />;
  if (isConditionsSegmentUnit(unit)) return <VistaCondicionesSegmento unit={unit} categoria={categoria} contexto={contexto} showConditionsTitle={entry.showConditionsTitle} continuation={entry.continuation} measurementRef={measurementRef} />;
  if (isRichTextColumnsStream(unit)) return <VistaBloque block={unit.block} bloques={bloques} categoria={categoria} contexto={contexto} measurementRef={measurementRef} />;
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
  const marginTop = Number.parseFloat(styles.marginTop || 0) || 0;
  const marginBottom = Number.parseFloat(styles.marginBottom || 0) || 0;
  // Las alturas de layout pueden ser fraccionarias; redondear hacia arriba
  // hace que la paginación sea conservadora respecto al recorte de la hoja.
  return Math.ceil(rect.height + marginTop + marginBottom);
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
  const measureTextTitleRefs = useRef(new Map());
  const measureConditionsTitleRefs = useRef(new Map());
  const measureRichTextNodeRefs = useRef(new Map());
  const measureTableHeaderRefs = useRef(new Map());
  const measureTableWrapRefs = useRef(new Map());
  const [medidas, setMedidas] = useState(null);
  const encabezadoAlcance = normalizedPreviewScope(plantilla?.encabezado_alcance);
  const pieAlcance = normalizedPreviewScope(plantilla?.pie_alcance);
  const measurementKey = useMemo(() => previewMeasurementKey(plantilla, bloquesVistaPrevia, contexto, categoria), [plantilla, bloquesVistaPrevia, contexto, categoria]);
  const titleMeasurements = useMemo(() => unidades.filter(unit => isRepeatUnit(unit) && unit.block.titulo).filter((unit, index, list) => list.findIndex(item => item.groupKey === unit.groupKey) === index), [unidades]);
  const textTitleMeasurements = useMemo(() => unidades
    .filter(unit => (unit.kind === 'rich-text-node' || isRichTextColumnsStream(unit)) && unit.block.titulo)
    .filter((unit, index, list) => list.findIndex(item => item.textBlockKey === unit.textBlockKey) === index), [unidades]);
  const conditionsTitleMeasurements = useMemo(() => unidades
    .filter(unit => isConditionsSegmentUnit(unit) && unit.block.titulo)
    .filter((unit, index, list) => list.findIndex(item => item.conditionsBlockKey === unit.conditionsBlockKey) === index), [unidades]);

  useLayoutEffect(() => {
    let activo = true;
    const medir = () => {
      if (!activo) return;
      const unitHeights = Object.fromEntries(unidades.map(unit => [unit.key, measureNodeHeight(measureUnitRefs.current.get(unit.key))]));
      const titleHeights = Object.fromEntries(titleMeasurements.flatMap(unit => ([
        [previewGroupTitleKey(unit, false), measureNodeHeight(measureGroupTitleRefs.current.get(previewGroupTitleKey(unit, false)))],
        [previewGroupTitleKey(unit, true), measureNodeHeight(measureGroupTitleRefs.current.get(previewGroupTitleKey(unit, true)))],
      ])));
      const textTitleHeights = Object.fromEntries(textTitleMeasurements.flatMap(unit => ([
        [previewTextBlockTitleKey(unit, false), measureNodeHeight(measureTextTitleRefs.current.get(previewTextBlockTitleKey(unit, false)))],
        [previewTextBlockTitleKey(unit, true), measureNodeHeight(measureTextTitleRefs.current.get(previewTextBlockTitleKey(unit, true)))],
      ])));
      const conditionsTitleHeights = Object.fromEntries(conditionsTitleMeasurements.flatMap(unit => ([
        [previewConditionsTitleKey(unit, false), measureNodeHeight(measureConditionsTitleRefs.current.get(previewConditionsTitleKey(unit, false)))],
        [previewConditionsTitleKey(unit, true), measureNodeHeight(measureConditionsTitleRefs.current.get(previewConditionsTitleKey(unit, true)))],
      ])));
      const richTextNodeHeights = Object.fromEntries([...measureRichTextNodeRefs.current.entries()].map(([key, node]) => [key, measureNodeHeight(node)]));
      const repeatedTables = [...new Map(unidades
        .filter(unit => unit.kind === 'repeat-table-row')
        .map(unit => [unit.tableKey, unit])).values()];
      const tableHeaderHeights = Object.fromEntries(repeatedTables.map(unit => {
        const tableKey = unit.tableKey;
        if (!unit.table.mostrar_encabezado) return [tableKey, 0];
        const headerHeight = measureNodeHeight(measureTableHeaderRefs.current.get(tableKey));
        const rowHeight = unidades.filter(unit => unit.kind === 'repeat-table-row' && unit.tableKey === tableKey).reduce((sum, unit) => sum + measureNodeHeight(measureUnitRefs.current.get(unit.key)), 0);
        const tableHeight = measureNodeHeight(measureTableWrapRefs.current.get(tableKey));
        return [tableKey, headerHeight + Math.max(0, tableHeight - headerHeight - rowHeight)];
      }));
      const next = {
        key:measurementKey,
        bloques:Object.fromEntries(unidades.filter(unit => unit.kind === 'block').map(unit => [unit.key, unitHeights[unit.key]])),
        unidades:unitHeights,
        titulosGrupo:titleHeights,
        titulosTextoRico:textTitleHeights,
        titulosCondiciones:conditionsTitleHeights,
        nodosTextoRico:richTextNodeHeights,
        encabezadosTabla:tableHeaderHeights,
        encabezado:measureNodeHeight(measureHeaderRef.current),
        pie:measureNodeHeight(measureFooterRef.current),
      };
      next.textoRicoSobredimensionados = richTextOversizedNodes(unidades, encabezadoAlcance, pieAlcance, next);
      setMedidas(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const frame = window.requestAnimationFrame(medir);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
      [measureSheetRef.current, measureHeaderRef.current, measureFooterRef.current, ...measureUnitRefs.current.values(), ...measureGroupTitleRefs.current.values(), ...measureTextTitleRefs.current.values(), ...measureConditionsTitleRefs.current.values(), ...measureRichTextNodeRefs.current.values(), ...measureTableHeaderRefs.current.values(), ...measureTableWrapRefs.current.values()].filter(Boolean).forEach(node => observer?.observe(node));
    document.fonts?.ready?.then(medir);
    return () => { activo = false; window.cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [measurementKey, unidades, titleMeasurements, textTitleMeasurements, conditionsTitleMeasurements]);

  useEffect(() => { onMeasurementsChange?.(medidas); }, [medidas, onMeasurementsChange]);

  const todasLasAlturasMedidas = medidas?.key === measurementKey && unidades.every(unit => {
    if (isRichTextColumnsStream(unit)) return unit.columns.every(column => column.nodes.every((node, index) => Number(medidas.nodosTextoRico?.[richTextNodeKey(unit.textBlockKey, column.id, index)]) > 0 || isIntentionallyEmptyRichTextNode(node)));
    return Number(medidas.unidades?.[unit.key]) > 0 || (unit.kind === 'rich-text-node' && isIntentionallyEmptyRichTextNode(unit.node));
  });
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
  const condicionesSobredimensionadas = useMemo(() => {
    if (!todasLasAlturasMedidas) return [];
    const capacidadMaxima = Math.max(previewPageCapacity(0, encabezadoAlcance, pieAlcance, medidas), previewPageCapacity(1, encabezadoAlcance, pieAlcance, medidas));
    return unidades.filter(unit => isConditionsSegmentUnit(unit)).filter(unit => {
      const titulo = Math.max(Number(medidas.titulosCondiciones?.[previewConditionsTitleKey(unit, false)] || 0), Number(medidas.titulosCondiciones?.[previewConditionsTitleKey(unit, true)] || 0));
      return Number(medidas.unidades?.[unit.key] || 0) + titulo > capacidadMaxima;
    });
  }, [todasLasAlturasMedidas, unidades, encabezadoAlcance, pieAlcance, medidas]);
  const textosRicosSobredimensionados = useMemo(() => todasLasAlturasMedidas ? medidas?.textoRicoSobredimensionados || [] : [], [todasLasAlturasMedidas, medidas]);

  const medicion = <div className="document-preview-measure" aria-hidden="true"><article ref={measureSheetRef} className="document-preview-sheet">
    <header ref={measureHeaderRef} className="document-preview-header"><VistaSeccionPlantilla value={plantilla?.encabezado_json} categoria={categoria} contexto={contexto} /></header>
    <main className="document-preview-body">{unidades.filter(unit => unit.kind !== 'repeat-table-row').map(unit => isRichTextColumnsStream(unit)
      ? <MedicionTextoRicoColumnas key={unit.key} unit={unit} categoria={categoria} contexto={contexto} measureNodeRefs={measureRichTextNodeRefs} />
      : <VistaUnidadFlujo key={unit.key} entry={{ unit, showGroupTitle:false, showTextTitle:false, showConditionsTitle:false, continuation:false }} measurementRef={node => { if (node) measureUnitRefs.current.set(unit.key, node); else measureUnitRefs.current.delete(unit.key); }} bloques={bloquesVistaPrevia} categoria={categoria} contexto={contexto} />)}<MedicionTablasRepetidas unidades={unidades} categoria={categoria} contexto={contexto} measureUnitRefs={measureUnitRefs} measureTableHeaderRefs={measureTableHeaderRefs} measureTableWrapRefs={measureTableWrapRefs} />{titleMeasurements.flatMap(unit => [false, true].map(continuation => <GroupHeading key={previewGroupTitleKey(unit, continuation)} unit={unit} categoria={categoria} contexto={{ ...(contexto || {}), item:unit.item }} continuation={continuation} measurementRef={node => { if (node) measureGroupTitleRefs.current.set(previewGroupTitleKey(unit, continuation), node); else measureGroupTitleRefs.current.delete(previewGroupTitleKey(unit, continuation)); }} />))}{textTitleMeasurements.flatMap(unit => [false, true].map(continuation => <TextBlockHeading key={previewTextBlockTitleKey(unit, continuation)} unit={unit} categoria={categoria} contexto={contexto} continuation={continuation} measurementRef={node => { if (node) measureTextTitleRefs.current.set(previewTextBlockTitleKey(unit, continuation), node); else measureTextTitleRefs.current.delete(previewTextBlockTitleKey(unit, continuation)); }} />))}{conditionsTitleMeasurements.flatMap(unit => [false, true].map(continuation => <ConditionsHeading key={previewConditionsTitleKey(unit, continuation)} unit={unit} categoria={categoria} contexto={contexto} continuation={continuation} measurementRef={node => { if (node) measureConditionsTitleRefs.current.set(previewConditionsTitleKey(unit, continuation), node); else measureConditionsTitleRefs.current.delete(previewConditionsTitleKey(unit, continuation)); }} />))}</main>
    <footer ref={measureFooterRef} className="document-preview-footer"><VistaSeccionPlantilla value={plantilla?.pie_json} categoria={categoria} contexto={contexto} /></footer>
  </article></div>;

  if (measurementOnly) return medicion;

  return <div className="document-preview">
    <div className="document-preview-toolbar"><span className="text-muted">Vista previa</span><div className="row" style={{gap:6}}><button type="button" className="btn btn-ghost" onClick={() => onZoom(zoom - 10)} disabled={zoom <= 50} aria-label="Alejar">−</button><span className="document-preview-zoom">{zoom}%</span><button type="button" className="btn btn-ghost" onClick={() => onZoom(zoom + 10)} disabled={zoom >= 150} aria-label="Acercar">+</button></div></div>
    {(instanciasSobredimensionadas.length > 0 || condicionesSobredimensionadas.length > 0 || textosRicosSobredimensionados.length > 0) && <div className="alert alert-warning" style={{margin:'0 0 12px'}}><strong>Atención:</strong> {[...instanciasSobredimensionadas.map(unit => `El ítem ${unit.index + 1}${unit.block.titulo ? ` de ${unit.block.titulo}` : ''} es más alto que una página y no se dividirá.`), ...condicionesSobredimensionadas.map(unit => `El segmento «${unit.segment.titulo || unit.segment.id || unit.index + 1}» de «${unit.block.titulo || 'Condiciones Generales'}» es más alto que una página y no puede dividirse.`), ...textosRicosSobredimensionados.map(item => item.nodeType === 'paragraph'
      ? `El párrafo ${item.paragraphIndex} del bloque «${item.blockTitle || 'Sin título'}» es más alto que una página y no puede dividirse.`
      : `El elemento ${item.index + 1} del bloque «${item.blockTitle || 'Sin título'}» es más alto que una página y no puede dividirse.`)].join(' ')}</div>}
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

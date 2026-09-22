import React, { useEffect, useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { normalizeRichTextDocument } from './RichTextEditor.jsx';
import { createRichTextExtensions } from './richTextExtensions.js';
import { renderTextoDocumental } from '../lib/variablesDocumentales.js';

export function resolverRichTextDocumental(value, categoria, contexto) {
  if (!categoria || contexto === null || contexto === undefined) return value;
  const resolverNodo = node => {
    if (!node || typeof node !== 'object') return node;
    const resolved = { ...node };
    if (typeof resolved.text === 'string') {
      const textoOriginal = resolved.text;
      resolved.text = renderTextoDocumental(textoOriginal, categoria, contexto);
    }
    if (Array.isArray(resolved.content)) resolved.content = resolved.content.map(resolverNodo);
    return resolved;
  };
  return resolverNodo(value);
}

// TipTap rechaza nodos de texto con text:'', que pueden aparecer después de
// resolver una variable documental sin valor (por ejemplo {{item.marca}} en
// un bloque que se está previsualizando sin contexto de ítem). Un párrafo sin
// hijos sí es válido y conserva una altura medible, por lo que solo se retiran
// los nodos de texto vacíos antes de crear el editor.
export function sanearNodosTextoVacios(value) {
  if (!value || typeof value !== 'object') return value;
  let saneado;
  if (value.type === 'text') {
    const texto = typeof value.text === 'string' ? value.text : '';
    // NBSP es el contenido mínimo intencional para una variable item vacía;
    // no debe confundirse con un nodo sin contenido renderizable.
    const textoVisible = texto.replace(/[ \t\n\r\f\v\u200B\uFEFF]/g, '');
    saneado = textoVisible ? { ...value, text: texto } : null;
  } else {
    const next = { ...value };
    if (Array.isArray(next.content)) {
      next.content = next.content.map(sanearNodosTextoVacios).filter(Boolean);
    }
    saneado = next;
  }

  return saneado;
}

export function prepararDocumentoRichTextPreview(value, categoria, contexto) {
  const resuelto = resolverRichTextDocumental(value, categoria, contexto);
  const saneado = sanearNodosTextoVacios(resuelto);
  const normalizado = normalizeRichTextDocument(saneado);

  // Un documento completamente vacío se representa como un párrafo vacío,
  // que es válido para TipTap y conserva una altura medible.
  if (!normalizado || normalizado.type !== 'doc') {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  if (!Array.isArray(normalizado.content) || normalizado.content.length === 0) {
    return { ...normalizado, content: [{ type: 'paragraph' }] };
  }
  return normalizado;
}

// Renderer de sólo lectura con las mismas extensiones TipTap del editor.
export function DocumentPreviewRichText({ value, className = '', categoria = null, contexto = null }) {
  const contenido = useMemo(
    () => prepararDocumentoRichTextPreview(value, categoria, contexto),
    [value, categoria, contexto],
  );
  const editor = useEditor({
    extensions: createRichTextExtensions({ includeHistory:false }),
    content: contenido,
    editable: false,
    editorProps: { attributes: { class: `rich-text-preview-content ${className}`.trim() } },
  });

  useEffect(() => {
    if (!editor) return;
    const next = contenido;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, contenido]);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

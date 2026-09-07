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
    if (typeof resolved.text === 'string') resolved.text = renderTextoDocumental(resolved.text, categoria, contexto);
    if (Array.isArray(resolved.content)) resolved.content = resolved.content.map(resolverNodo);
    return resolved;
  };
  return resolverNodo(value);
}

// Renderer de sólo lectura con las mismas extensiones TipTap del editor.
export function DocumentPreviewRichText({ value, className = '', categoria = null, contexto = null }) {
  const contenido = useMemo(
    () => normalizeRichTextDocument(resolverRichTextDocumental(value, categoria, contexto)),
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

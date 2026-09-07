import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { normalizeRichTextDocument } from './RichTextEditor.jsx';
import { createRichTextExtensions } from './richTextExtensions.js';

// Renderer de sólo lectura con las mismas extensiones TipTap del editor.
export function DocumentPreviewRichText({ value, className = '' }) {
  const editor = useEditor({
    extensions: createRichTextExtensions({ includeHistory:false }),
    content: normalizeRichTextDocument(value),
    editable: false,
    editorProps: { attributes: { class: `rich-text-preview-content ${className}`.trim() } },
  });

  useEffect(() => {
    if (!editor) return;
    const next = normalizeRichTextDocument(value);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

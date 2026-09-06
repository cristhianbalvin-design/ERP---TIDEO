import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import History from '@tiptap/extension-history';
import { normalizeRichTextDocument } from './RichTextEditor.jsx';

// Renderer de sólo lectura con las mismas extensiones TipTap del editor.
export function DocumentPreviewRichText({ value, className = '' }) {
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, Bold, Italic, Underline, BulletList, OrderedList, ListItem, History],
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

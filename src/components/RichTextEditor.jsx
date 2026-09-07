import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { createRichTextExtensions, FONT_SIZES, LINE_HEIGHTS } from './richTextExtensions.js';

const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] };

export const normalizeRichTextDocument = value => (
  value && typeof value === 'object' && value.type === 'doc' ? value : EMPTY_DOCUMENT
);

export function RichTextEditor({ value, onChange, placeholder = 'Escribe el contenido…', disabled = false, minHeight = 110, variables = [] }) {
  const editor = useEditor({
    extensions: createRichTextExtensions(),
    content: normalizeRichTextDocument(value),
    editable: !disabled,
    editorProps: { attributes: { class: 'rich-text-editor-content', 'data-placeholder': placeholder } },
    onUpdate: ({ editor: currentEditor }) => onChange?.({
      contenido_json: currentEditor.getJSON(),
      contenido_texto_plano: currentEditor.getText(),
    }),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const next = normalizeRichTextDocument(value);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;
  const command = (name, attrs) => () => editor.chain().focus()[name](attrs).run();
  const insertarVariable = token => {
    if (!token) return;
    editor.chain().focus().insertContent(token).run();
  };
  const button = (label, name, attrs, activeName = name) => (
    <button type="button" className={`btn btn-ghost ${editor.isActive(activeName) ? 'active' : ''}`} onClick={command(name, attrs)} disabled={disabled} style={{padding:'4px 8px', minWidth:30}}>{label}</button>
  );
  const alignmentButton = (label, alignment, title) => (
    <button type="button" title={title} className={`btn btn-ghost ${editor.isActive({ textAlign:alignment }) ? 'active' : ''}`} onClick={command('setTextAlign', alignment)} disabled={disabled} style={{padding:'4px 8px', minWidth:30}}>{label}</button>
  );
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '';
  const currentLineHeight = editor.getAttributes('textStyle').lineHeight || '';
  const setSelectCommand = commandName => event => {
    const value = event.target.value;
    if (commandName === 'setFontSize') editor.chain().focus().setFontSize(value || null).run();
    if (commandName === 'setLineHeight') editor.chain().focus().setLineHeight(value || null).run();
  };

  return (
    <div style={{border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', background:'var(--bg)'}}>
      {!disabled && <div className="row" style={{gap:2, padding:6, borderBottom:'1px solid var(--border)', flexWrap:'wrap'}}>
        {button(<strong>B</strong>, 'toggleBold')}
        {button(<em>I</em>, 'toggleItalic')}
        {button(<u>U</u>, 'toggleUnderline')}
        {button('• Lista', 'toggleBulletList', undefined, 'bulletList')}
        {button('1. Lista', 'toggleOrderedList', undefined, 'orderedList')}
        <select className="input" value={currentFontSize} onChange={setSelectCommand('setFontSize')} disabled={disabled} aria-label="Tamaño de fuente" style={{width:'auto', padding:'4px 8px', minHeight:30}}>
          <option value="">Tamaño</option>
          {FONT_SIZES.map(size => <option key={size.value} value={size.value}>{size.label}</option>)}
        </select>
        <select className="input" value={currentLineHeight} onChange={setSelectCommand('setLineHeight')} disabled={disabled} aria-label="Interlineado" style={{width:'auto', padding:'4px 8px', minHeight:30}}>
          <option value="">Interlineado</option>
          {LINE_HEIGHTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {alignmentButton('←', 'left', 'Alinear a la izquierda')}
        {alignmentButton('↔', 'center', 'Centrar')}
        {alignmentButton('→', 'right', 'Alinear a la derecha')}
        {alignmentButton('≡', 'justify', 'Justificar')}
        {variables.length > 0 && <select className="input" defaultValue="" onChange={e => { insertarVariable(e.target.value); e.currentTarget.value = ''; }} disabled={disabled} style={{width:'auto', padding:'4px 8px', minHeight:30}}>
          <option value="">Insertar variable…</option>
          {variables.map(variable => <option key={variable.token} value={variable.token}>{variable.grupo}: {variable.label}</option>)}
        </select>}
        <button type="button" className="btn btn-ghost" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} style={{padding:'4px 8px'}}>↶</button>
        <button type="button" className="btn btn-ghost" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} style={{padding:'4px 8px'}}>↷</button>
      </div>}
      <EditorContent editor={editor} style={{padding:'8px 10px', minHeight}} />
    </div>
  );
}

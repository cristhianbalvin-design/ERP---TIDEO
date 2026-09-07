import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { createRichTextExtensions, FONT_SIZES, LINE_HEIGHTS } from './richTextExtensions.js';

const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] };

const normalizeRichTextNode = node => {
  if (!node || typeof node !== 'object') return node;
  return {
    ...node,
    // Las imágenes insertadas antes del resize usaban el nodo oficial `image`.
    // Se convierten en memoria para que sigan visibles y puedan redimensionarse.
    type: node.type === 'image' ? 'imageResize' : node.type,
    ...(Array.isArray(node.content) ? { content:node.content.map(normalizeRichTextNode) } : {}),
  };
};

const BLOCK_NODE_TYPES = new Set(['paragraph', 'imageResize', 'horizontalRule', 'bulletList', 'orderedList', 'twoColumnLine']);

const asBlockChildren = children => {
  const blocks = [];
  let inline = [];
  const flushInline = () => {
    if (inline.length || blocks.length === 0) blocks.push({ type:'paragraph', content:inline });
    inline = [];
  };
  children.forEach(child => {
    if (BLOCK_NODE_TYPES.has(child.type)) {
      if (inline.length) flushInline();
      blocks.push(child);
    } else inline.push(child);
  });
  if (inline.length) flushInline();
  return blocks;
};

const normalizeRichTextNodes = node => {
  if (!node || typeof node !== 'object') return [node];
  const { content, ...nodeWithoutContent } = node;
  const normalized = normalizeRichTextNode(nodeWithoutContent);
  const children = Array.isArray(content) ? content.flatMap(normalizeRichTextNodes) : null;
  if (normalized.type === 'paragraph') return asBlockChildren(children || []).map(block => block.type === 'paragraph' ? { ...normalized, content:block.content || [] } : block);
  if (normalized.type === 'twoColumnSide' || normalized.type === 'doc') return [{ ...normalized, content:asBlockChildren(children || []) }];
  return [{ ...normalized, ...(children ? { content:children } : {}) }];
};

export const normalizeRichTextDocument = value => (
  value && typeof value === 'object' && value.type === 'doc'
    ? normalizeRichTextNodes(value)[0]
    : EMPTY_DOCUMENT
);

export function RichTextEditor({ value, onChange, placeholder = 'Escribe el contenido…', disabled = false, minHeight = 110, variables = [], onUploadImage = null, showHorizontalRule = false, showTwoColumnLine = false }) {
  const imageInputRef = useRef(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');
  const [, setSelectionTick] = useState(0);
  const editor = useEditor({
    extensions: createRichTextExtensions(),
    content: normalizeRichTextDocument(value),
    editable: !disabled,
    editorProps: { attributes: { class: 'rich-text-editor-content', 'data-placeholder': placeholder } },
    onUpdate: ({ editor: currentEditor }) => onChange?.({
      contenido_json: currentEditor.getJSON(),
      contenido_texto_plano: currentEditor.getText(),
    }),
    onSelectionUpdate: () => setSelectionTick(tick => tick + 1),
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
  const insertarImagen = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUploadImage) return;
    setSubiendoImagen(true); setErrorImagen('');
    try {
      const { url } = await onUploadImage(file);
      if (!url) throw new Error('No se pudo obtener la URL de la imagen subida.');
      // Un bloque seguido de un párrafo mantiene un punto de escritura normal
      // debajo de la imagen; Gapcursor cubre la posición inmediatamente anterior.
      editor.chain().focus().insertContent([
        {
          type:'imageResize',
          attrs:{
            src:url,
            alt:file.name,
            containerStyle:'width: 320px; max-width: 100%; height: auto; cursor: pointer;',
            wrapperStyle:'display: flex; margin: 0; max-width: 100%;',
          },
        },
        { type:'paragraph' },
      ]).run();
    } catch (err) {
      setErrorImagen(err.message || 'No se pudo subir la imagen.');
    } finally {
      setSubiendoImagen(false);
    }
  };
  const button = (label, name, attrs, activeName = name) => (
    <button type="button" className={`btn btn-ghost ${editor.isActive(activeName) ? 'active' : ''}`} onClick={command(name, attrs)} disabled={disabled} style={{padding:'4px 8px', minWidth:30}}>{label}</button>
  );
  const alignmentButton = (label, alignment, title) => (
    <button type="button" title={title} className={`btn btn-ghost ${editor.isActive({ textAlign:alignment }) ? 'active' : ''}`} onClick={command('setTextAlign', alignment)} disabled={disabled} style={{padding:'4px 8px', minWidth:30}}>{label}</button>
  );
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '';
  const currentLineHeight = editor.getAttributes('textStyle').lineHeight || '';
  const twoColumnLine = (() => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === 'twoColumnLine') return node;
    }
    return null;
  })();
  const twoColumnPreset = twoColumnLine?.attrs.leftWidth || '';
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
        {onUploadImage && <><input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={insertarImagen} hidden /><button type="button" className="btn btn-ghost" onClick={() => imageInputRef.current?.click()} disabled={disabled || subiendoImagen} style={{padding:'4px 8px'}}>{subiendoImagen ? 'Subiendo imagen…' : 'Insertar imagen'}</button></>}
        {showHorizontalRule && button('—', 'setHorizontalRule', undefined, 'horizontalRule')}
        {showTwoColumnLine && button('⇔ 2 col.', 'insertTwoColumnLine', undefined, 'twoColumnLine')}
        {showTwoColumnLine && twoColumnLine && <span className="row" style={{gap:2}}><span className="text-muted" style={{fontSize:12}}>Proporción:</span>{['50%', '30%', '70%'].map(leftWidth => <button type="button" key={leftWidth} className={`btn btn-ghost ${twoColumnPreset === leftWidth ? 'active' : ''}`} onClick={() => editor.chain().focus().setTwoColumnLinePreset(leftWidth).run()} disabled={disabled} style={{padding:'4px 8px'}}>{leftWidth === '50%' ? '50/50' : leftWidth === '30%' ? '30/70' : '70/30'}</button>)}</span>}
        <button type="button" className="btn btn-ghost" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} style={{padding:'4px 8px'}}>↶</button>
        <button type="button" className="btn btn-ghost" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} style={{padding:'4px 8px'}}>↷</button>
      </div>}
      {errorImagen && <div className="alert alert-danger" style={{margin:'8px 10px 0'}}>{errorImagen}</div>}
      <EditorContent editor={editor} style={{padding:'8px 10px', minHeight}} />
    </div>
  );
}

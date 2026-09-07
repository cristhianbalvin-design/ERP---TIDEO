import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { TextStyle, FontSize, LineHeight } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import ImageResize from 'tiptap-extension-resize-image';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { Node, mergeAttributes } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import History from '@tiptap/extension-history';

export const FONT_SIZES = [
  { value: '12px', label: 'Pequeño' },
  { value: '14px', label: 'Normal' },
  { value: '18px', label: 'Grande' },
  { value: '24px', label: 'Título' },
];

export const LINE_HEIGHTS = [
  { value: '1', label: 'Simple' },
  { value: '1.5', label: '1.5' },
  { value: '2', label: 'Doble' },
];

const TwoColumnSide = Node.create({
  name: 'twoColumnSide',
  inline: true,
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag:'span[data-document-two-column-side]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class:'rich-text-two-column-side', 'data-document-two-column-side':'' }), 0],
});

const TwoColumnLine = Node.create({
  name: 'twoColumnLine',
  group: 'block',
  content: 'twoColumnSide twoColumnSide',
  defining: true,
  parseHTML: () => [{ tag:'div[data-document-two-column-line]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { class:'rich-text-two-column-line', 'data-document-two-column-line':'' }), 0],
  addCommands() {
    return {
      insertTwoColumnLine: () => ({ commands }) => commands.insertContent({
        type: this.name,
        content: [{ type:'twoColumnSide' }, { type:'twoColumnSide' }],
      }),
    };
  },
});

export const createRichTextExtensions = ({ includeHistory = true } = {}) => [
  Document,
  Paragraph,
  Text,
  TextStyle,
  FontSize,
  LineHeight,
  TextAlign.configure({ types:['paragraph'], alignments:['left', 'center', 'right', 'justify'] }),
  ImageResize.configure({ inline:true, allowBase64:false, minWidth:48, maxWidth:680 }),
  HorizontalRule,
  TwoColumnLine,
  TwoColumnSide,
  Bold,
  Italic,
  Underline,
  BulletList,
  OrderedList,
  ListItem,
  ...(includeHistory ? [History] : []),
];

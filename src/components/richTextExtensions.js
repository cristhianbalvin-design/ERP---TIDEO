import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { TextStyle, FontSize, LineHeight } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
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

export const createRichTextExtensions = ({ includeHistory = true } = {}) => [
  Document,
  Paragraph,
  Text,
  TextStyle,
  FontSize,
  LineHeight,
  TextAlign.configure({ types:['paragraph'], alignments:['left', 'center', 'right', 'justify'] }),
  Image.configure({ allowBase64:false }),
  Bold,
  Italic,
  Underline,
  BulletList,
  OrderedList,
  ListItem,
  ...(includeHistory ? [History] : []),
];

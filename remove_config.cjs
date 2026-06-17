const fs = require('fs');
const file = 'd:/VIBECODING/ERP - TIDEO/src/pages_admin.jsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = 'function TiposDocumentoConfigPanel({ onClose }) {';
const endStr = '\nfunction TiposDocumentoPanel({ onClose, onGoToRequisitos }) {';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.slice(0, startIndex) + content.slice(endIndex + 1); // +1 to keep the newline before function TiposDocumentoPanel
  fs.writeFileSync(file, content, 'utf8');
  console.log('Removed successfully.');
} else {
  console.log('Not found:', startIndex, endIndex);
}

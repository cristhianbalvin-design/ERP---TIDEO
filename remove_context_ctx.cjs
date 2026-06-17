const fs = require('fs');

// context.jsx
const file = 'd:/VIBECODING/ERP - TIDEO/src/context.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/  const \[tiposDocumentoConfig, setTiposDocumentoConfig\] = useState\(\[\]\);\n/, '');
content = content.replace(/          const tdocConfig = await maestrosService\.getTiposDocumentoConfig\(empresa\.id\);\n/, '');
content = content.replace(/            setTiposDocumentoConfig\(tdocConfig \|\| \[\]\);\n/, '');
content = content.replace(/    tiposDocumentoConfig, setTiposDocumentoConfig, upsertTipoDocumentoConfigCtx, toggleActivoTipoDocumentoConfigCtx, cargarTiposSugeridosCtx,\n/, '');

const regexFuncs = /  const upsertTipoDocumentoConfigCtx[\s\S]*?cargarTiposSugeridosCtx[\s\S]*?\n  };\n/;
content = content.replace(regexFuncs, '');

fs.writeFileSync(file, content, 'utf8');
console.log('Removed context references');

// maestrosService.js
const file2 = 'd:/VIBECODING/ERP - TIDEO/src/services/maestrosService.js';
let content2 = fs.readFileSync(file2, 'utf8');

const idx = content2.indexOf('  // Tipos de Documento Config');
if(idx !== -1){
   content2 = content2.slice(0, idx).trimEnd() + '\n};\n';
   fs.writeFileSync(file2, content2, 'utf8');
   console.log('Removed maestrosService references');
}

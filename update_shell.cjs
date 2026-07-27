const fs = require('fs');
let code = fs.readFileSync('src/shell.jsx', 'utf8');

const target = `{ key: 'planes', label: 'Planes y Licencias', icon: I.package },`;
const replaceWith = `{ key: 'planes', label: 'Planes y Licencias', icon: I.package },
    { key: 'salud_implementacion', label: 'Salud de Implementación', icon: I.check },`;

code = code.replace(target, replaceWith);

fs.writeFileSync('src/shell.jsx', code, 'utf8');
console.log('shell.jsx actualizado exitosamente');

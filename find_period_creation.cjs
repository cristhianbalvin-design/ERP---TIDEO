const fs = require('fs');
const path = require('path');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      search(full);
    } else if (full.endsWith('.jsx') || full.endsWith('.js')) {
      const txt = fs.readFileSync(full, 'utf8');
      if (txt.includes('periodos_nomina') && txt.includes('insert(')) {
        console.log('Found in:', full);
      }
      if (txt.includes('upsertPeriodo')) {
        console.log('upsertPeriodo in:', full);
      }
    }
  }
}
search('src');

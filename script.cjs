const fs = require('fs');
const path = require('path');
const d = 'd:/VIBECODING/ERP - TIDEO/src';
const files = [
  ...fs.readdirSync(d).filter(f => f.endsWith('.js') || f.endsWith('.jsx')).map(f => path.join(d, f)),
  ...fs.readdirSync(path.join(d, 'services')).filter(f => f.endsWith('.js')).map(f => path.join(d, 'services', f))
];
const res = [];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('supabase.from(') || l.includes('Repository(') || l.includes('tabla:')) {
      res.push(`${f}:${i+1} => ${l.trim()}`);
    }
  });
});
fs.writeFileSync('d:/VIBECODING/ERP - TIDEO/tablas_refs.txt', res.join('\n'));

const fs = require('fs');
const path = require('path');

function analyzeDir(dir, ext) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
  let result = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    result.push({ file: f, length: content.length, lines: content.split('\n').length });
  }
  return result;
}

console.log('--- PAGES ---');
console.log(analyzeDir('src', '.jsx').filter(x => x.file.startsWith('pages_')));
console.log('--- SERVICES ---');
console.log(analyzeDir('src/services', '.js'));
console.log('--- MIGRATIONS ---');
console.log(analyzeDir('supabase/migrations', '.sql').length + ' migrations found.');


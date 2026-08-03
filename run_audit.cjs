const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const servicesDir = path.join(srcDir, 'services');
const migrationsDir = path.join(__dirname, 'supabase', 'migrations');

const output = {
  pages: {},
  services: {},
  migrations: [],
  app_routes: [],
  context_exports: [],
  dead_code: []
};

// 1. Pages
const files = fs.readdirSync(srcDir);
const pageFiles = files.filter(f => f.startsWith('pages_') && f.endsWith('.jsx'));
for (const file of pageFiles) {
  const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const components = [...content.matchAll(/export (function|const) ([A-Z][a-zA-Z0-9_]*)/g)].map(m => m[2]);
  output.pages[file] = components;
}

// 2. Services
const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
for (const file of serviceFiles) {
  const content = fs.readFileSync(path.join(servicesDir, file), 'utf8');
  const methods = [...content.matchAll(/(?:export const|async function) ([a-zA-Z0-9_]+)/g)].map(m => m[1]);
  output.services[file] = methods;
}

// 3. Migrations (recent ones > 363)
const migFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql') && parseInt(f.split('_')[0]) > 363);
for (const file of migFiles) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const createTables = [...content.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.([a-zA-Z0-9_]+)/gi)].map(m => m[1]);
  const alterTables = [...content.matchAll(/ALTER TABLE public\.([a-zA-Z0-9_]+)/gi)].map(m => m[1]);
  const rpcs = [...content.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-zA-Z0-9_]+)/gi)].map(m => m[1]);
  output.migrations.push({
    file,
    tables_created: createTables,
    tables_altered: [...new Set(alterTables)],
    rpcs
  });
}

// 4. App.jsx Routes
const appContent = fs.readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
const routes = [...appContent.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
output.app_routes = routes;

fs.writeFileSync(path.join(__dirname, 'audit_results.json'), JSON.stringify(output, null, 2));
console.log('Audit completed.');


const fs = require('fs');
const path = require('path');

// 1. Analyze SQL Migrations
const migrationsDir = 'supabase/migrations';
const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const tables = new Map(); // name -> Set of columns
let lastMigration = '';

for (const mig of migrations) {
  lastMigration = mig;
  const content = fs.readFileSync(path.join(migrationsDir, mig), 'utf8');
  
  // Basic Regex for CREATE TABLE
  const createTableRegex = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const cols = match[2].split(',').map(c => c.trim().split(/\s+/)[0]).filter(c => c && !c.toUpperCase().startsWith('PRIMARY') && !c.toUpperCase().startsWith('FOREIGN') && !c.toUpperCase().startsWith('UNIQUE') && !c.toUpperCase().startsWith('CONSTRAINT'));
    if (!tables.has(tableName)) tables.set(tableName, new Set());
    cols.forEach(c => tables.get(tableName).add(c));
  }
  
  // Basic Regex for ALTER TABLE ADD COLUMN
  const alterTableRegex = /ALTER TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-zA-Z0-9_]+)\s+ADD COLUMN (?:IF NOT EXISTS )?([a-zA-Z0-9_]+)/gi;
  while ((match = alterTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const colName = match[2];
    if (!tables.has(tableName)) tables.set(tableName, new Set());
    tables.get(tableName).add(colName);
  }
}

// 2. Analyze App.jsx for Routes
const appJsx = fs.readFileSync('src/App.jsx', 'utf8');
const routes = [];
const routeRegex = /<Route\s+path=[\"']([^\"']+)[\"']/g;
let rMatch;
while ((rMatch = routeRegex.exec(appJsx)) !== null) {
  routes.push(rMatch[1]);
}

// 3. Output basic report to a file
let report = '# AUDIT REPORT\n\n## 1. MIGRATIONS\nLast Migration: ' + lastMigration + '\nTotal Migrations: ' + migrations.length + '\n\n## 2. TABLES AND COLUMNS\n';
for (const [table, cols] of tables.entries()) {
  report += '- **' + table + '** (' + Array.from(cols).join(', ') + ')\n';
}

report += '\n## 3. ROUTES IN App.jsx\n' + routes.join('\n') + '\n';

fs.writeFileSync('audit_facts.md', report);
console.log('Done generating audit_facts.md');


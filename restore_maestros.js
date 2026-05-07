import fs from 'fs';
import { execSync } from 'child_process';

const headContent = execSync('git show HEAD:src/pages_admin.jsx').toString('utf8');
const workContent = fs.readFileSync('src/pages_admin.jsx', 'utf8');

const regex = /function Maestros\(\) \{[\s\S]*?(?=function RRHHAdmin\(\) \{|function Finanzas\(\) \{|\/\/ ============)/;

const headMaestrosMatch = headContent.match(regex);
const workMaestrosMatch = workContent.match(regex);

if (!headMaestrosMatch || !workMaestrosMatch) {
    console.error("Could not find function Maestros() in one of the files.");
    process.exit(1);
}

const headMaestros = headMaestrosMatch[0];

const newWorkContent = workContent.replace(regex, headMaestros);
fs.writeFileSync('src/pages_admin.jsx', newWorkContent, 'utf8');
console.log("Restored Maestros() block successfully.");

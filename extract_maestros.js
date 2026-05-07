import fs from 'fs';

const diff = fs.readFileSync('admin_diff_utf8.txt', 'utf8');
const lines = diff.split('\n');

let extracting = false;
let output = [];

for (const line of lines) {
  if (line.includes('@@') && line.includes('function Maestros() {')) {
    extracting = true;
  } else if (line.includes('@@') && (line.includes('function Servicios() {') || line.includes('function RRHHAdmin() {') || line.includes('function Tarifarios() {'))) {
    extracting = false;
  }
  
  if (extracting && !line.startsWith('@@')) {
    if (line.startsWith('+') || line.startsWith(' ')) {
      output.push(line.substring(1));
    } else if (line.startsWith('-')) {
      // skip deleted line
    }
  }
}

fs.writeFileSync('maestros_recovered.jsx', output.join('\n'));
console.log('Done recovering');

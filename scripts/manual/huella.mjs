// Huella por componente: hash del código de una pantalla y de las declaraciones locales que usa.
// Una ficha queda desactualizada solo si cambia el código de su pantalla, no cualquier línea del archivo.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { leerAst, recorrer, raiz } from './inventario-codigo.mjs';

const normalizar = texto => texto.replace(/\r\n?/g, '\n').split('\n').map(linea => linea.trimEnd()).join('\n').trim();

function declaracionesTopLevel(ast) {
  const mapa = new Map();
  for (const nodo of ast.program.body) {
    const decl = (nodo.type === 'ExportNamedDeclaration' || nodo.type === 'ExportDefaultDeclaration') && nodo.declaration ? nodo.declaration : nodo;
    if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') { if (decl.id) mapa.set(decl.id.name, nodo); }
    else if (decl.type === 'VariableDeclaration') for (const d of decl.declarations) if (d.id?.type === 'Identifier') mapa.set(d.id.name, nodo);
  }
  return mapa;
}

// Devuelve el código del componente y de todas las declaraciones de nivel superior del mismo archivo que alcanza.
export function codigoComponente(referencia, root = raiz) {
  const [archivo, nombre] = referencia.split('#');
  if (!nombre) return normalizar(readFileSync(path.join(root, archivo), 'utf8'));
  const { ast, codigo } = leerAst(archivo, root);
  const decls = declaracionesTopLevel(ast);
  if (!decls.has(nombre)) throw new Error(`${referencia}: no se encontró la declaración ${nombre}`);
  const incluidos = new Set();
  const pendientes = [nombre];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (incluidos.has(actual)) continue;
    incluidos.add(actual);
    recorrer(decls.get(actual), nodo => {
      const nombreUsado = nodo.type === 'Identifier' ? nodo.name : nodo.type === 'JSXIdentifier' ? nodo.name : null;
      if (nombreUsado && decls.has(nombreUsado) && !incluidos.has(nombreUsado)) pendientes.push(nombreUsado);
    });
  }
  const nodos = [...new Set([...incluidos].map(n => decls.get(n)))].sort((a, b) => a.start - b.start);
  return nodos.map(n => normalizar(codigo.slice(n.start, n.end))).join('\n\n');
}

export const huellaComponente = (referencia, root = raiz) =>
  createHash('sha256').update(codigoComponente(referencia, root)).digest('hex').slice(0, 10);

export const huellas = (componentes, root = raiz) => componentes.map(c => huellaComponente(c, root));

// Origen de datos de una pantalla, leído del código con Babel (sin IA).
// Sirve para que el estado del catálogo canónico (activa / maqueta) sea verificable:
// una pantalla "activa" debe leer datos reales (Supabase, servicios o el contexto que los carga),
// y no solo los datos ficticios de los archivos data.js o constantes *MOCK*.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { leerAst, mapaImportaciones, recorrer, raiz } from './inventario-codigo.mjs';

// Señales de datos ficticios: imports de un data.js, o identificadores con MOCK / _SAC_DATA en el nombre.
const MODULO_MOCK = /(^|\/)data(\.jsx?)?$/;
const NOMBRE_MOCK = /MOCK|_SAC_DATA/;
// Señales de datos reales escritas directamente en el componente.
const LLAMADAS_REALES = new Set(['useApp', 'useSesionOperativa', 'useCuentaOperativa', 'getSupabaseClient', 'useContext']);
const TOCA_BASE = /supabase|\.rpc\(/;

const PROFUNDIDAD_MAXIMA = 5;
// Componentes React en PascalCase (las constantes en MAYÚSCULAS, como RESUMEN, no lo son).
const ES_COMPONENTE = /^[A-Z][a-z]/;

function crearLector(root) {
  const archivos = new Map();
  const tocaBase = new Map();
  const resolver = relativo => {
    for (const candidato of [relativo, `${relativo}.jsx`, `${relativo}.js`, `${relativo}/index.jsx`, `${relativo}/index.js`]) {
      if (/\.(jsx?|mjs)$/.test(candidato) && existsSync(path.join(root, candidato))) return candidato;
    }
    return null;
  };
  const leer = relativo => {
    if (!archivos.has(relativo)) {
      const { ast, codigo } = leerAst(relativo, root);
      const imports = mapaImportaciones(ast, relativo);
      const superiores = new Map();
      for (const nodo of ast.program.body) {
        const decl = nodo.type === 'ExportNamedDeclaration' || nodo.type === 'ExportDefaultDeclaration' ? nodo.declaration : nodo;
        if (!decl) continue;
        if (decl.type === 'FunctionDeclaration' && decl.id) superiores.set(decl.id.name, decl);
        if (decl.type === 'VariableDeclaration') for (const d of decl.declarations) if (d.id?.type === 'Identifier') superiores.set(d.id.name, d);
        if (nodo.type === 'ExportDefaultDeclaration') superiores.set('default', decl);
      }
      archivos.set(relativo, { ast, codigo, imports, superiores });
    }
    return archivos.get(relativo);
  };
  const moduloTocaBase = relativo => {
    if (!tocaBase.has(relativo)) tocaBase.set(relativo, TOCA_BASE.test(readFileSync(path.join(root, relativo), 'utf8')));
    return tocaBase.get(relativo);
  };
  return { leer, resolver, moduloTocaBase };
}

// Cuenta señales reales y ficticias de un componente y de los componentes que renderiza (sin salir del proyecto).
export function origenDatos(referencia, root = raiz) {
  const lector = crearLector(root);
  const visitados = new Set();
  const resultado = { real: 0, mock: 0, fuentesMock: new Set() };

  const analizar = (archivo, nombre, profundidad) => {
    const clave = `${archivo}#${nombre}`;
    if (visitados.has(clave) || profundidad > PROFUNDIDAD_MAXIMA) return;
    visitados.add(clave);
    const resuelto = lector.resolver(archivo);
    if (!resuelto) return;
    const { imports, superiores } = lector.leer(resuelto);
    const nodo = superiores.get(nombre) ?? (nombre !== 'default' ? null : superiores.get('default'));
    if (!nodo) return;
    const constantesVistas = new Set();

    const examinar = (raizNodo, esConstante) => {
      recorrer(raizNodo, n => {
        if (n.type === 'Identifier' || n.type === 'JSXIdentifier') {
          const imp = imports.get(n.name);
          if (NOMBRE_MOCK.test(n.name) || (imp && MODULO_MOCK.test(imp.archivo))) {
            resultado.mock += 1;
            resultado.fuentesMock.add(n.name);
          } else if (!esConstante && n.type === 'Identifier' && superiores.has(n.name) && !constantesVistas.has(n.name) && n.name !== nombre && !ES_COMPONENTE.test(n.name)) {
            // Constante del módulo (p. ej. un resumen calculado sobre un mock): se examina una vez.
            constantesVistas.add(n.name);
            examinar(superiores.get(n.name), true);
          } else if (!esConstante && n.type === 'Identifier' && imp && ES_COMPONENTE.test(n.name) && n.name !== nombre) {
            // Componente importado usado por referencia (p. ej. const Component = cond ? Dashboard : BIComercial).
            analizar(imp.archivo, imp.exportado === 'default' ? 'default' : imp.exportado, profundidad + 1);
          }
        }
        if (n.type === 'CallExpression') {
          const callee = n.callee;
          const base = callee.type === 'Identifier' ? callee.name
            : callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : null;
          const metodo = callee.type === 'MemberExpression' ? (callee.property.name ?? callee.property.value) : null;
          const desdeServicio = base && imports.has(base) && (() => {
            const destino = lector.resolver(imports.get(base).archivo);
            return destino ? lector.moduloTocaBase(destino) : false;
          })();
          if ((base && LLAMADAS_REALES.has(base)) || desdeServicio || metodo === 'rpc'
            || (metodo === 'from' && n.arguments[0]?.type === 'StringLiteral' && base !== 'Array')) resultado.real += 1;
        }
        if (!esConstante && n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name.name)) {
          const hijo = n.name.name;
          if (hijo === nombre) return;
          // Los imports (incluidos los lazy(() => import(...))) van primero: una constante lazy no tiene cuerpo propio.
          if (imports.has(hijo)) {
            const imp = imports.get(hijo);
            analizar(imp.archivo, imp.exportado === 'default' ? 'default' : imp.exportado, profundidad + 1);
          } else if (superiores.has(hijo)) analizar(resuelto, hijo, profundidad + 1);
        }
      });
    };
    examinar(nodo, false);
  };

  const [archivo, nombre] = referencia.split('#');
  analizar(archivo, nombre, 0);
  // Exportación por defecto con otro nombre local (lazy(() => import('./x.jsx'))).
  if (!resultado.real && !resultado.mock) analizar(archivo, 'default', 0);
  return { real: resultado.real, mock: resultado.mock, fuentesMock: [...resultado.fuentesMock].sort() };
}

// Clasificación usada por la verificación del catálogo.
export function clasificarOrigen({ real, mock }) {
  if (real && mock) return 'mixto';
  if (real) return 'real';
  if (mock) return 'mock';
  return 'sin_datos';
}

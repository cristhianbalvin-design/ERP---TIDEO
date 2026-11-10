// Inventario de pantallas leído directamente del código (sin IA).
// Fuente para verificar el catálogo canónico (catalogo/pantallas.json) y el mapa de cobertura de Aria.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const OMITIR = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'range']);

export function leerAst(relativo, root = raiz) {
  const codigo = readFileSync(path.join(root, relativo), 'utf8');
  return { codigo, ast: parse(codigo, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }) };
}

export function recorrer(nodo, visitar, padre = null) {
  if (!nodo || typeof nodo.type !== 'string') return;
  if (visitar(nodo, padre) === false) return;
  for (const clave of Object.keys(nodo)) {
    if (OMITIR.has(clave)) continue;
    const valor = nodo[clave];
    if (Array.isArray(valor)) valor.forEach(hijo => recorrer(hijo, visitar, nodo));
    else if (valor && typeof valor.type === 'string') recorrer(valor, visitar, nodo);
  }
}

const nombreClave = prop => prop.key?.name ?? prop.key?.value;

export function valorPropiedad(objeto, nombre) {
  const prop = objeto?.properties?.find(p => p.type === 'ObjectProperty' && nombreClave(p) === nombre);
  if (!prop) return undefined;
  const v = prop.value;
  if (v.type === 'StringLiteral') return v.value;
  if (v.type === 'BooleanLiteral') return v.value;
  if (v.type === 'ArrayExpression') return v.elements.filter(e => e?.type === 'StringLiteral').map(e => e.value);
  if (v.type === 'TemplateLiteral' && v.expressions.length === 0) return v.quasis.map(q => q.value.cooked).join('');
  return null;
}

const resolverModulo = (desde, especificador) => especificador.startsWith('.')
  ? path.posix.normalize(path.posix.join(path.posix.dirname(desde), especificador))
  : especificador;

// Mapa nombreLocal -> { archivo, exportado } a partir de imports y lazy(() => import(...)).
export function mapaImportaciones(ast, archivo) {
  const mapa = new Map();
  for (const nodo of ast.program.body) {
    if (nodo.type !== 'ImportDeclaration') continue;
    const destino = resolverModulo(archivo, nodo.source.value);
    for (const esp of nodo.specifiers) {
      const exportado = esp.type === 'ImportDefaultSpecifier' ? 'default' : (esp.imported?.name ?? esp.imported?.value ?? '*');
      mapa.set(esp.local.name, { archivo: destino, exportado });
    }
  }
  recorrer(ast.program, nodo => {
    if (nodo.type !== 'VariableDeclarator' || nodo.id?.type !== 'Identifier' || nodo.init?.type !== 'CallExpression') return;
    const callee = nodo.init.callee;
    const esLazy = (callee.type === 'Identifier' && callee.name === 'lazy') || (callee.type === 'MemberExpression' && callee.property?.name === 'lazy');
    if (!esLazy) return;
    let destino = null; let exportado = 'default';
    recorrer(nodo.init, n => {
      if (n.type === 'CallExpression' && n.callee.type === 'Import' && n.arguments[0]?.type === 'StringLiteral') destino = resolverModulo(archivo, n.arguments[0].value);
      if (n.type === 'ObjectProperty' && nombreClave(n) === 'default' && n.value.type === 'MemberExpression') exportado = n.value.property.name;
    });
    if (destino) mapa.set(nodo.id.name, { archivo: destino, exportado });
  });
  return mapa;
}

const nombreJsx = nombre => nombre.type === 'JSXIdentifier' ? nombre.name
  : nombre.type === 'JSXMemberExpression' ? `${nombreJsx(nombre.object)}.${nombre.property.name}` : null;

function primerComponente(nodos) {
  let encontrado = null;
  for (const n of nodos) {
    recorrer(n, nodo => {
      if (encontrado) return false;
      if (nodo.type === 'JSXElement') { encontrado = nombreJsx(nodo.openingElement.name); return false; }
    });
    if (encontrado) break;
  }
  return encontrado;
}

// Casos de un switch: [{ ruta, componente }] con fallthrough resuelto.
export function casosSwitch(ast, filtroDiscriminante) {
  const casos = [];
  recorrer(ast.program, nodo => {
    if (nodo.type !== 'SwitchStatement') return;
    if (filtroDiscriminante && !(nodo.discriminant.type === 'Identifier' && filtroDiscriminante.includes(nodo.discriminant.name))) return;
    let pendientes = [];
    for (const caso of nodo.cases) {
      if (!caso.test) continue;
      if (caso.test.type !== 'StringLiteral') continue;
      pendientes.push(caso.test.value);
      if (!caso.consequent.length) continue;
      const componente = primerComponente(caso.consequent);
      for (const ruta of pendientes) casos.push({ ruta, componente, alias: pendientes.filter(r => r !== ruta) });
      pendientes = [];
    }
  });
  return casos;
}

const ubicarComponente = (mapa, archivo, componente) => {
  if (!componente) return null;
  const base = componente.split('.')[0];
  const imp = mapa.get(base);
  const destino = imp ? imp.archivo : archivo;
  const exportado = imp ? (imp.exportado === 'default' ? base : imp.exportado) : base;
  const normal = /\.(jsx?|tsx?)$/.test(destino) ? destino : `${destino}.jsx`;
  return `${normal}#${exportado}`;
};

function arregloDeclarado(ast, nombre) {
  let arreglo = null;
  recorrer(ast.program, nodo => {
    if (arreglo) return false;
    if (nodo.type === 'VariableDeclarator' && nodo.id?.name === nombre) {
      let init = nodo.init;
      while (init && init.type === 'CallExpression') init = init.callee?.object ?? init.arguments?.[0];
      if (init?.type === 'ArrayExpression') arreglo = init;
      if (!arreglo) recorrer(nodo.init, n => { if (!arreglo && n.type === 'ArrayExpression') arreglo = n; });
    }
  });
  return arreglo;
}

function cadenasDeSet(ast, nombre) {
  let valores = [];
  recorrer(ast.program, nodo => {
    if (nodo.type === 'VariableDeclarator' && nodo.id?.name === nombre && nodo.init?.type === 'NewExpression') {
      const arg = nodo.init.arguments[0];
      if (arg?.type === 'ArrayExpression') valores = arg.elements.filter(e => e?.type === 'StringLiteral').map(e => e.value);
    }
  });
  return valores;
}

export function pantallasPermisos(root = raiz) {
  const { ast } = leerAst('src/data.js', root);
  const arreglo = arregloDeclarado(ast, 'pantallasPermisos');
  return (arreglo?.elements ?? []).filter(e => e?.type === 'ObjectExpression').map(obj => ({
    clave: valorPropiedad(obj, 'key'), modulo: valorPropiedad(obj, 'modulo'), titulo: valorPropiedad(obj, 'pantalla'), acciones: valorPropiedad(obj, 'acciones') ?? [],
  }));
}

export function inventarioAdmin(root = raiz) {
  const archivo = 'src/App.jsx';
  const { ast } = leerAst(archivo, root);
  const imports = mapaImportaciones(ast, archivo);
  const rutas = casosSwitch(ast, ['active']).map(c => ({ ...c, componente: ubicarComponente(imports, archivo, c.componente) }));
  const menu = leerAst('src/shell.jsx', root).ast;
  const secciones = arregloDeclarado(menu, 'SIDEBAR');
  const enMenu = new Map();
  for (const seccion of secciones?.elements ?? []) {
    const nombre = valorPropiedad(seccion, 'section');
    const items = seccion.properties.find(p => nombreClave(p) === 'items')?.value?.elements ?? [];
    for (const item of items) enMenu.set(valorPropiedad(item, 'key'), { seccion: nombre, etiqueta: valorPropiedad(item, 'label'), accion: valorPropiedad(item, 'action') ?? null });
  }
  return { rutas, menu: enMenu };
}

export function inventarioOperaciones(root = raiz) {
  const base = 'operaciones-app/src/zahory-mock';
  const archivos = [`${base}/ZahoryRoutes.jsx`, `${base}/routes/businessLinesRoutes.jsx`, `${base}/routes/workshopOperationsRoutes.jsx`, `${base}/routes/supplyAdministrationRoutes.jsx`];
  const disponibles = new Set();
  const porRuta = new Map();
  for (const archivo of archivos) {
    const { ast } = leerAst(archivo, root);
    const imports = mapaImportaciones(ast, archivo);
    for (const nombre of ['availableZahoryRoutes', 'businessLinesRouteIds', 'workshopOperationsRouteIds', 'supplyAdministrationRouteIds']) cadenasDeSet(ast, nombre).forEach(r => disponibles.add(r));
    for (const caso of casosSwitch(ast, ['route', 'routeId', 'id'])) {
      if (!porRuta.has(caso.ruta)) porRuta.set(caso.ruta, { ...caso, componente: ubicarComponente(imports, archivo, caso.componente) });
    }
  }
  // Pantallas que OperationalApp renderiza fuera del shadow root (p. ej. el Inicio con Aria).
  const app = 'operaciones-app/src/OperationalApp.jsx';
  const { ast: astApp, codigo: codigoApp } = leerAst(app, root);
  const importsApp = mapaImportaciones(astApp, app);
  for (const m of codigoApp.matchAll(/route === '([a-z0-9-]+)' \?\s*\(\s*<main[^>]*>\s*<([A-Z][A-Za-z0-9]*)/g)) {
    const previo = porRuta.get(m[1]);
    porRuta.set(m[1], { ruta: m[1], alias: previo?.alias ?? [], componente: ubicarComponente(importsApp, app, m[2]) });
  }
  const { ast: shell } = leerAst(`${base}/components/shell.jsx`, root);
  const zonas = arregloDeclarado(shell, 'SIDEBAR_ZONES');
  const menu = new Map();
  const visitar = (obj, contexto) => {
    if (obj?.type !== 'ObjectExpression') return;
    const id = valorPropiedad(obj, 'id'); const etiqueta = valorPropiedad(obj, 'label');
    const hijos = ['items', 'groups', 'areaItems', 'tailItems', 'subItems'].flatMap(k => obj.properties.find(p => nombreClave(p) === k)?.value?.elements ?? []);
    if (id && etiqueta && !menu.has(id) && valorPropiedad(obj, 'type') !== 'divider') menu.set(id, { etiqueta, contexto: [...contexto], alias: valorPropiedad(obj, 'altIds') ?? [] });
    hijos.forEach(h => visitar(h, etiqueta ? [...contexto, etiqueta] : contexto));
  };
  (zonas?.elements ?? []).forEach(z => visitar(z, []));
  return { disponibles, porRuta, menu };
}

export function inventarioMovil(root = raiz) {
  const archivo = 'src/pages_mobile.jsx';
  const { ast } = leerAst(archivo, root);
  const imports = mapaImportaciones(ast, archivo);
  const perfiles = [];
  recorrer(ast.program, nodo => {
    if (nodo.type === 'ObjectExpression' && valorPropiedad(nodo, 'k') && valorPropiedad(nodo, 'l') && nodo.properties.some(p => nombreClave(p) === 'icon')) perfiles.push({ ruta: valorPropiedad(nodo, 'k'), etiqueta: valorPropiedad(nodo, 'l') });
  });
  const vistas = new Map();
  recorrer(ast.program, nodo => {
    if (nodo.type !== 'LogicalExpression' || nodo.operator !== '&&') return;
    const izq = nodo.left;
    if (izq.type === 'BinaryExpression' && izq.operator === '===' && izq.left.type === 'Identifier' && izq.left.name === 'profile' && izq.right.type === 'StringLiteral' && nodo.right.type === 'JSXElement') {
      vistas.set(izq.right.value, ubicarComponente(imports, archivo, nombreJsx(nodo.right.openingElement.name)));
    }
  });
  return perfiles.map(p => ({ ...p, componente: vistas.get(p.ruta) ?? null }));
}

// Inventario normalizado: una entrada por pantalla navegable.
export function inventario(root = raiz) {
  const admin = inventarioAdmin(root);
  const ops = inventarioOperaciones(root);
  const movil = inventarioMovil(root);
  const entradas = [];
  for (const r of admin.rutas) {
    const m = admin.menu.get(r.ruta);
    entradas.push({ app: 'admin', ruta: r.ruta, alias: r.alias, componente: r.componente, etiqueta: m?.etiqueta ?? null, grupo: m?.seccion ?? null });
  }
  // Una ruta es pantalla propia si está en el menú o si nadie del menú la absorbe; las rutas
  // que comparten bloque del switch o son altIds con el mismo componente quedan como alias.
  const canonica = new Map();
  for (const ruta of ops.disponibles) {
    const caso = ops.porRuta.get(ruta);
    if (ops.menu.has(ruta) || !caso) continue;
    const grupo = [ruta, ...(caso.alias ?? [])];
    const delMenu = grupo.find(r => ops.menu.has(r) && ops.porRuta.get(r)?.componente === caso.componente);
    if (delMenu) canonica.set(ruta, delMenu);
  }
  for (const [id, m] of ops.menu) {
    for (const alt of m.alias) {
      if (ops.disponibles.has(alt) && !ops.menu.has(alt) && ops.porRuta.get(alt)?.componente === ops.porRuta.get(id)?.componente) canonica.set(alt, id);
    }
  }
  for (const ruta of [...ops.disponibles].sort()) {
    if (canonica.has(ruta)) continue;
    const caso = ops.porRuta.get(ruta);
    const m = ops.menu.get(ruta);
    const alias = [...canonica].filter(([, destino]) => destino === ruta).map(([origen]) => origen).sort();
    entradas.push({ app: 'operaciones', ruta, alias, componente: caso?.componente ?? null, etiqueta: m?.etiqueta ?? null, grupo: m?.contexto?.join(' / ') || null });
  }
  for (const p of movil) entradas.push({ app: 'movil', ruta: p.ruta, alias: [], componente: p.componente, etiqueta: p.etiqueta, grupo: 'Versión Móvil' });
  return entradas;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const datos = inventario();
  process.stdout.write(`${JSON.stringify(datos, null, 1)}\n`);
}

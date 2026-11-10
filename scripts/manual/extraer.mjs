// Extractor del modo consultor de Aria: lee el código de una pantalla y lista lo que el usuario ve y hace
// (botones, campos, mensajes, permisos y datos que usa). Es el borrador fiel al código para escribir su ficha.
// Uso: node scripts/manual/extraer.mjs <clave del catálogo>   (p. ej. admin/solpe)
//      node scripts/manual/extraer.mjs --componente src/archivo.jsx#Componente
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { codigoComponente } from './huella.mjs';
import { recorrer, raiz } from './inventario-codigo.mjs';
import { leerCatalogo } from './catalogo.mjs';

const ATRIBUTOS_CAMPO = new Set(['label', 'placeholder', 'title', 'aria-label', 'helperText', 'hint']);
const FUNCIONES_MENSAJE = /^(setError|setErrores|setMensaje|setAviso|setNotice|setOk|setExito|toast|notify|notificar|addNotificacion|addToast|showToast|alert|confirm|mostrar\w*|avisar\w*)$/;
const METODOS_MENSAJE = /^(error|success|warning|info|warn)$/;
const FUNCIONES_PERMISO = /^(perm|can)$|puede|permiso|tieneAcceso|canAccess/i;
const limpiar = texto => String(texto).replace(/\s+/g, ' ').trim();

function textoPlano(nodo) {
  if (!nodo) return '';
  if (nodo.type === 'StringLiteral') return nodo.value;
  if (nodo.type === 'TemplateLiteral') return nodo.quasis.map(q => q.value.cooked).join('…');
  if (nodo.type === 'JSXText') return nodo.value;
  if (nodo.type === 'JSXExpressionContainer') return textoPlano(nodo.expression);
  if (nodo.type === 'ConditionalExpression') return [textoPlano(nodo.consequent), textoPlano(nodo.alternate)].filter(Boolean).join(' / ');
  if (nodo.type === 'LogicalExpression') return textoPlano(nodo.right);
  return '';
}

function textoJsx(elemento) {
  const partes = [];
  // Solo el contenido visible (hijos), no los atributos como title o className.
  for (const hijo of elemento.children ?? []) recorrer(hijo, nodo => {
    if (nodo.type === 'JSXAttribute') return false;
    if (nodo.type === 'JSXText' || (nodo.type === 'JSXExpressionContainer' && ['StringLiteral', 'TemplateLiteral', 'ConditionalExpression'].includes(nodo.expression?.type))) {
      partes.push(textoPlano(nodo));
      return nodo.type === 'JSXText';
    }
    return true;
  });
  return limpiar(partes.join(' '));
}

const nombreJsx = nodo => nodo?.type === 'JSXIdentifier' ? nodo.name : nodo?.type === 'JSXMemberExpression' ? `${nombreJsx(nodo.object)}.${nodo.property.name}` : '';
const atributo = (elemento, nombre) => elemento.openingElement.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === nombre);
const nombreLlamada = callee => callee?.type === 'Identifier' ? callee.name : callee?.type === 'MemberExpression' ? (callee.property?.name ?? '') : '';

// Analiza código fuente (JSX) y devuelve conjuntos ordenados por categoría.
export function extraerDeCodigo(codigo) {
  const ast = parse(codigo, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
  const r = { botones: new Set(), campos: new Set(), mensajes: new Set(), permisos: new Set(), rpcs: new Set(), tablas: new Set(), funciones: new Set(), servicios: new Set() };
  recorrer(ast, (nodo, padre) => {
    if (nodo.type === 'JSXElement') {
      const nombre = nombreJsx(nodo.openingElement.name);
      const esBoton = /^(button|Button|IconButton)$/.test(nombre.split('.').pop()) || Boolean(atributo(nodo, 'onClick') && /^(button|a)$/.test(nombre));
      if (esBoton) {
        const texto = textoJsx(nodo) || textoPlano(atributo(nodo, 'aria-label')?.value) || textoPlano(atributo(nodo, 'title')?.value);
        // Un botón envuelto en `puedeX && <button>` solo aparece con ese permiso.
        const condicion = padre?.type === 'LogicalExpression' && padre.operator === '&&' && padre.left?.type === 'Identifier' && /^puede|^can|^es[A-Z]/.test(padre.left.name) ? ` (solo si ${padre.left.name})` : '';
        if (texto && texto.length <= 80) r.botones.add(texto + condicion);
      }
      if (nombre === 'label' || nombre === 'legend' || nombre === 'th') {
        const texto = textoJsx(nodo);
        if (texto && texto.length <= 80) r.campos.add(texto);
      }
    }
    if (nodo.type === 'JSXAttribute' && ATRIBUTOS_CAMPO.has(nodo.name?.name)) {
      const texto = limpiar(textoPlano(nodo.value));
      if (texto && texto.length <= 80) r.campos.add(texto);
    }
    if (nodo.type === 'NewExpression' && nodo.callee?.name === 'Error') {
      const texto = limpiar(textoPlano(nodo.arguments[0]));
      if (texto) r.mensajes.add(texto);
    }
    if (nodo.type === 'CallExpression') {
      const nombre = nombreLlamada(nodo.callee);
      const primero = nodo.arguments[0];
      const literal = primero?.type === 'StringLiteral' ? primero.value : null;
      if (nombre === 'rpc' && literal) r.rpcs.add(literal);
      else if (nombre === 'from' && literal && nodo.callee.type === 'MemberExpression') r.tablas.add(literal);
      else if (nombre === 'invoke' && literal) r.funciones.add(literal);
      else if (nodo.callee.type === 'MemberExpression' && /Service$|Servicio$/.test(nodo.callee.object?.name ?? '')) r.servicios.add(`${nodo.callee.object.name}.${nombre}`);
      else if (FUNCIONES_MENSAJE.test(nombre) || (nodo.callee.type === 'MemberExpression' && METODOS_MENSAJE.test(nombre) && /toast|notif|mensaje/i.test(nodo.callee.object?.name ?? ''))) {
        const texto = limpiar(textoPlano(primero));
        if (texto && texto.length > 3) r.mensajes.add(texto);
      } else if (FUNCIONES_PERMISO.test(nombre)) {
        const args = nodo.arguments.map(a => a.type === 'StringLiteral' ? a.value : null).filter(Boolean);
        if (args.length) r.permisos.add(`${nombre}(${args.join(', ')})`);
      }
    }
    return true;
  });
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b, 'es'))]));
}

export function extraerPantalla(referencias, root = raiz) {
  const codigo = referencias.map(ref => codigoComponente(ref, root)).join('\n\n');
  return extraerDeCodigo(codigo);
}

const SECCIONES = [['botones', 'Botones y acciones'], ['campos', 'Campos, columnas y etiquetas'], ['mensajes', 'Mensajes y validaciones'], ['permisos', 'Permisos que consulta'], ['servicios', 'Operaciones de datos (servicios)'], ['rpcs', 'Funciones de base de datos (RPC)'], ['tablas', 'Tablas que lee o escribe'], ['funciones', 'Edge Functions']];

export function renderExtraccion(titulo, referencias, datos) {
  const lineas = [`# ${titulo}`, '', `Componentes: ${referencias.join(', ')}`, '', 'Borrador generado del código; verifica cada punto en la pantalla antes de pasarlo a la ficha.', ''];
  for (const [clave, nombre] of SECCIONES) {
    lineas.push(`## ${nombre}`, '');
    lineas.push(...(datos[clave].length ? datos[clave].map(item => `- ${item}`) : ['- (ninguno detectado)']), '');
  }
  return lineas.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    let referencias; let titulo;
    if (args[0] === '--componente') { referencias = args.slice(1); titulo = referencias.join(', '); }
    else {
      const pantalla = leerCatalogo().pantallas.find(p => p.clave === args[0]);
      if (!pantalla) throw new Error(`No existe la pantalla ${args[0]} en catalogo/pantallas.json`);
      referencias = [pantalla.componente];
      titulo = `${pantalla.titulo} (${pantalla.clave})`;
    }
    if (!referencias.length || !referencias[0]) throw new Error('Indica una clave del catálogo o --componente archivo#Componente');
    process.stdout.write(renderExtraccion(titulo, referencias, extraerPantalla(referencias)) + '\n');
  } catch (error) {
    process.stderr.write(`ERROR ${error.message}\n`);
    process.exitCode = 1;
  }
}

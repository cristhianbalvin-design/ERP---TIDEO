import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { generarPlantillasCecoCebe, PLANTILLAS_CECO_CEBE, FILAS_PREFORMATEADAS, FORMATO_FECHA, FORMATO_NUMERO } from './generate-ceco-cebe-templates.mjs';
import { validarFilasImportacionCebe, validarFilasImportacionCeco } from '../src/utils/cecoCebeImport.js';

const rutas = generarPlantillasCecoCebe();

const leerLibro = ruta => XLSX.read(readFileSync(ruta), { type: 'buffer', cellStyles: true });
const encabezadosInstrucciones = ws => {
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const filaCabecera = filas.findIndex(fila => fila[0] === 'Columna');
  assert.notEqual(filaCabecera, -1, 'La hoja de instrucciones debe declarar la columna "Columna".');
  return filas.slice(filaCabecera + 1).map(fila => fila[0]).filter(Boolean);
};
const formatoCelda = (ws, encabezados, encabezado) => ws[XLSX.utils.encode_cell({ c: encabezados.indexOf(encabezado), r: 1 })]?.z;
const valoresBajoEncabezado = ws => Object.entries(ws)
  .filter(([direccion, cell]) => /^[A-Z]+\d+$/.test(direccion) && XLSX.utils.decode_cell(direccion).r > 0 && cell.v !== undefined && cell.v !== null)
  .length;
const filasPreformateadas = ws => XLSX.utils.decode_range(ws['!ref']).e.r;

for (const definicion of PLANTILLAS_CECO_CEBE) {
  const ruta = rutas.find(candidate => candidate.endsWith(definicion.archivo));
  const wb = leerLibro(ruta);
  const wsDatos = wb.Sheets[definicion.hojaDatos];
  const wsInstrucciones = wb.Sheets.Instrucciones;
  const encabezadosDatos = XLSX.utils.sheet_to_json(wsDatos, { header: 1, range: 0, raw: true })[0];
  const declarados = encabezadosInstrucciones(wsInstrucciones);
  const formatosFecha = Object.fromEntries(definicion.columnasFecha.map(columna => [columna, formatoCelda(wsDatos, encabezadosDatos, columna)]));
  const formatosNumericos = Object.fromEntries(definicion.columnasNumericas.map(columna => [columna, formatoCelda(wsDatos, encabezadosDatos, columna)]));
  const celdasConValor = valoresBajoEncabezado(wsDatos);
  const preformateadas = filasPreformateadas(wsDatos);
  const listasCoinciden = JSON.stringify(encabezadosDatos) === JSON.stringify(declarados);

  assert.deepEqual(wb.SheetNames, ['Instrucciones', definicion.hojaDatos]);
  assert.equal(listasCoinciden, true);
  assert.equal(celdasConValor, 0);
  assert.equal(preformateadas, FILAS_PREFORMATEADAS);
  Object.values(formatosFecha).forEach(formato => assert.equal(formato, FORMATO_FECHA));
  Object.values(formatosNumericos).forEach(formato => assert.equal(formato, FORMATO_NUMERO));

  console.log(`PLANTILLA ${definicion.archivo}`);
  console.log(`Hojas: ${JSON.stringify(wb.SheetNames)}`);
  console.log(`Encabezados datos: ${JSON.stringify(encabezadosDatos)}`);
  console.log(`Encabezados instrucciones: ${JSON.stringify(declarados)}`);
  console.log(`Listas coinciden: ${listasCoinciden}`);
  console.log(`Celdas con valor bajo encabezado: ${celdasConValor}`);
  console.log(`Formatos fecha (fila vacía 2): ${JSON.stringify(formatosFecha)}`);
  console.log(`Formatos numéricos (fila vacía 2): ${JSON.stringify(formatosNumericos)}`);
  console.log(`Filas preformateadas: ${preformateadas}`);
}

const libros = Object.fromEntries(PLANTILLAS_CECO_CEBE.map(definicion => [
  definicion.archivo,
  leerLibro(rutas.find(candidate => candidate.endsWith(definicion.archivo))),
]));
const filaImportada = (archivo, hoja, valores) => {
  const ws = libros[archivo].Sheets[hoja];
  const encabezados = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true })[0];
  encabezados.forEach((encabezado, index) => {
    const direccion = XLSX.utils.encode_cell({ c: index, r: 1 });
    ws[direccion] = { t: 's', v: valores[encabezado] ?? '' };
  });
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
};

const cebeFilas = filaImportada('plantilla_cebes.xlsx', 'CEBEs', {
  codigo: 'CEBE-PLANTILLA-OK', nombre: 'Centro de beneficio de prueba', tipo: 'linea_servicio',
  cargo_financiero_dbs: 'Cliente_Contrato', descripcion: 'Fila válida desde plantilla', estado: 'activo',
});
const cebeValidada = validarFilasImportacionCebe(cebeFilas, { centrosBeneficio: [], cuentas: [], usuarios: [] })[0];
assert.deepEqual(cebeValidada._errores, []);
assert.equal(cebeValidada.descripcion, 'Fila válida desde plantilla');
assert.equal(cebeValidada.estado, 'activo');

const cecoFilas = filaImportada('plantilla_cecos.xlsx', 'CECOs', {
  codigo: 'CECO-PLANTILLA-OK', nombre: 'Centro de costo de prueba', tipo: 'proyecto',
  naturaleza_economica: 'productivo', cebe_padre: 'CEBE-PLANTILLA', especialidad: 'ESP-PLANTILLA',
  responsable: 'Usuario de prueba', sede_padre: 'SED-PLANTILLA', presupuesto_mensual: '2500.50',
  fecha_inicio: '15/08/2026', fecha_fin: '31/12/2026', descripcion: 'Fila válida desde plantilla', estado: 'activo',
});
const cecoValidada = validarFilasImportacionCeco(cecoFilas, {
  centrosCosto: [], centrosBeneficio: [{ id: 'cebe-1', codigo: 'CEBE-PLANTILLA' }],
  sedes: [{ id: 'sede-1', codigo: 'SED-PLANTILLA' }], especialidades: [{ id: 'esp-1', codigo: 'ESP-PLANTILLA' }],
  usuarios: [{ id: 'usuario-1', nombre: 'Usuario de prueba', estado: 'activo' }],
})[0];
assert.deepEqual(cecoValidada._errores, []);
assert.equal(cecoValidada.descripcion, 'Fila válida desde plantilla');
assert.equal(cecoValidada.estado, 'activo');
console.log('Importador CECO/CEBE: acepta filas válidas leídas de ambas plantillas, incluyendo descripcion y estado.');

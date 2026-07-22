import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  validarFilasImportacionCebe,
  validarFilasImportacionCeco,
} from './src/utils/cecoCebeImport.js';
import { importarMaestroSinSobrescribir } from './src/services/maestrosService.js';

const PROYECTO_URL = 'https://atqwyjfidfoepthygfoo.supabase.co';
const EMPRESA_ID = 'emp_2000000000';
const PREFIJO_QA = 'QA-IMP-20260722';

const leerEnv = path => Object.fromEntries(
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);

const env = leerEnv('.env.local');
assert.equal(env.VITE_SUPABASE_URL, PROYECTO_URL, 'La prueba solo puede ejecutarse en el proyecto autorizado.');
const apiKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
assert.ok(apiKey, 'Falta una credencial Supabase para la prueba.');

const supabase = createClient(env.VITE_SUPABASE_URL, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const consultar = async (tabla, columnas = '*') => {
  const { data, error } = await supabase
    .from(tabla)
    .select(columnas)
    .eq('empresa_id', EMPRESA_ID);
  if (error) throw error;
  return data || [];
};

const { data: tenant, error: tenantError } = await supabase
  .from('empresas')
  .select('id,razon_social')
  .eq('id', EMPRESA_ID)
  .single();
if (tenantError) throw tenantError;
assert.equal(tenant?.id, EMPRESA_ID);
assert.equal(tenant?.razon_social, 'PRUEBA');

const [centrosCosto, centrosBeneficio, sedes, especialidades] = await Promise.all([
  consultar('centros_costo', 'id,codigo'),
  consultar('centros_beneficio', 'id,codigo'),
  consultar('sedes', 'id,codigo,nombre'),
  consultar('especialidades_tecnicas', 'id,codigo,nombre'),
]);
assert.equal(
  centrosBeneficio.some(item => String(item.codigo).trim().toUpperCase() === 'CEBE-INT-001'),
  true,
  'No se encontró el CEBE de control del tenant PRUEBA; se aborta la prueba.',
);

const duplicadoBase = validarFilasImportacionCebe([{
  codigo: ' cebe-int-001 ',
  nombre: 'No debe importarse',
  tipo: 'linea_servicio',
  cargo_financiero_dbs: 'Interno_Empresa',
}], { centrosBeneficio, cuentas: [], usuarios: [] })[0];
assert.deepEqual(duplicadoBase._errores, [
  'Código duplicado: "CEBE-INT-001" ya existe en este tenant.',
]);
const resultadoDuplicadoBase = await importarMaestroSinSobrescribir({
  supabase,
  tabla: 'centros_beneficio',
  empresaId: EMPRESA_ID,
  filas: [duplicadoBase],
  prefijoId: 'cebe',
  campos: [
    'codigo', 'nombre', 'tipo', 'cargo_financiero_dbs', 'modelo_negocio',
    'responsable_id', 'responsable_nombre', 'cuenta_id', 'meta_ingresos',
    'fecha_inicio', 'fecha_fin', 'descripcion', 'estado',
  ],
});
assert.equal(resultadoDuplicadoBase.insertados.length, 0);
assert.deepEqual(resultadoDuplicadoBase.rechazados.map(item => item.motivo), [
  'Código duplicado: "CEBE-INT-001" ya existe en este tenant.',
]);

const duplicadosArchivo = validarFilasImportacionCebe([
  { codigo: `${PREFIJO_QA}-DUP`, nombre: 'Duplicado A', tipo: 'linea_servicio', cargo_financiero_dbs: 'Cliente_Contrato' },
  { codigo: `${PREFIJO_QA.toLowerCase()}-dup`, nombre: 'Duplicado B', tipo: 'linea_servicio', cargo_financiero_dbs: 'Cliente_Contrato' },
], { centrosBeneficio, cuentas: [], usuarios: [] });
assert.equal(duplicadosArchivo.length, 2);
assert.equal(duplicadosArchivo.every(row => row._errores.length === 1), true);
assert.equal(
  duplicadosArchivo.every(row => row._errores[0] === `Código duplicado en el archivo: "${PREFIJO_QA}-DUP" aparece en las filas 2, 3.`),
  true,
);

const referenciasInvalidas = validarFilasImportacionCeco([{
  codigo: `${PREFIJO_QA}-REF`,
  nombre: 'Referencias inexistentes',
  tipo: 'proyecto',
  cebe_padre: `${PREFIJO_QA}-NO-CEBE`,
  sede_padre: `${PREFIJO_QA}-NO-SEDE`,
  especialidad: `${PREFIJO_QA}-NO-ESP`,
}], { centrosCosto, centrosBeneficio, sedes, especialidades, usuarios: [] })[0];
assert.equal(referenciasInvalidas._errores.filter(error => error.startsWith('CEBE padre inexistente')).length, 1);
assert.equal(referenciasInvalidas._errores.filter(error => error.startsWith('Sede padre inexistente')).length, 1);
assert.equal(referenciasInvalidas._errores.filter(error => error.startsWith('Especialidad inexistente')).length, 1);

const casosCargo = [
  [`${PREFIJO_QA}-CLI`, 'Cliente_Contrato', true],
  ['CEBE-INT-001', 'Interno_Empresa', false],
  ['CEBE-CAP-001', 'Capital_Propio', false],
  [`${PREFIJO_QA}-GAR`, 'Garantia_Fabrica', false],
  [`${PREFIJO_QA}-REW`, 'Reclamo_Rework', false],
];
const codigosVerificacion = casosCargo.map(([codigo]) => codigo);
const filasQa = casosCargo.map(([codigo, cargo]) => ({
  codigo,
  nombre: `Prueba importador ${cargo}`,
  tipo: 'linea_servicio',
  cargo_financiero_dbs: cargo,
  responsable: codigo === `${PREFIJO_QA}-CLI` ? 'USUARIO QA INEXISTENTE 20260722' : '',
  estado: 'activo',
}));
const validadasQa = validarFilasImportacionCebe(filasQa, {
  centrosBeneficio,
  cuentas: [],
  usuarios: [],
});
assert.equal(validadasQa.every(row => row._errores.length === 1), true);
assert.equal(validadasQa.every(row => row._errores[0].includes('ya existe en este tenant')), true);
assert.equal(validadasQa[0].responsable_id, null);
assert.equal(validadasQa[0].responsable_nombre, null);
assert.deepEqual(validadasQa[0]._advertencias, [
  'Responsable no encontrado entre los usuarios activos; la fila se importará sin responsable.',
]);

const filasParaInsertar = validadasQa.map(({ _errores, _advertencias, ...row }) => row);
const resultado = await importarMaestroSinSobrescribir({
  supabase,
  tabla: 'centros_beneficio',
  empresaId: EMPRESA_ID,
  filas: filasParaInsertar,
  prefijoId: 'cebe',
  campos: [
    'codigo', 'nombre', 'tipo', 'cargo_financiero_dbs', 'modelo_negocio',
    'responsable_id', 'responsable_nombre', 'cuenta_id', 'meta_ingresos',
    'fecha_inicio', 'fecha_fin', 'descripcion', 'estado',
  ],
});
assert.equal(resultado.insertados.length, 0);
assert.equal(resultado.rechazados.length, 5);
assert.equal(resultado.rechazados.every(item => item.motivo.includes('ya existe en este tenant')), true);

const { data: verificacion, error: verificacionError } = await supabase
  .from('centros_beneficio')
  .select('empresa_id,codigo,tipo,cargo_financiero_dbs,modelo_negocio,es_facturable,responsable_id,responsable_nombre')
  .eq('empresa_id', EMPRESA_ID)
  .in('codigo', codigosVerificacion)
  .order('codigo');
if (verificacionError) throw verificacionError;
assert.equal(verificacion?.length, 5);

for (const [codigo, cargo, esperado] of casosCargo) {
  const row = verificacion.find(item => item.codigo === codigo);
  assert.ok(row);
  assert.equal(row.cargo_financiero_dbs, cargo);
  assert.equal(row.es_facturable, esperado);
}
const responsableQa = verificacion.find(item => item.codigo === `${PREFIJO_QA}-CLI`);
assert.equal(responsableQa.responsable_id, null);
assert.equal(responsableQa.responsable_nombre, null);

console.log(JSON.stringify({
  tenant,
  prueba_duplicado_base: duplicadoBase._errores,
  prueba_duplicado_servicio: {
    insertados: resultadoDuplicadoBase.insertados.length,
    rechazados: resultadoDuplicadoBase.rechazados,
  },
  prueba_duplicado_archivo: duplicadosArchivo.map(row => ({ fila: row._fila, errores: row._errores })),
  prueba_referencias: referenciasInvalidas._errores,
  prueba_responsable: {
    advertencias: validadasQa[0]._advertencias,
    responsable_id: responsableQa.responsable_id,
    responsable_nombre: responsableQa.responsable_nombre,
  },
  resultado_reintento_cargos: {
    insertados: resultado.insertados.length,
    rechazados: resultado.rechazados,
  },
  verificacion_cargos: verificacion,
}, null, 2));

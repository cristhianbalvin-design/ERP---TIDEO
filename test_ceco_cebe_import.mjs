import { strict as assert } from 'node:assert';
import {
  validarFilasImportacionCebe,
  validarFilasImportacionCeco,
} from './src/utils/cecoCebeImport.js';

const catalogos = {
  centrosCosto: [{ id: 'cc_1', codigo: 'CECO-001' }],
  centrosBeneficio: [{ id: 'cb_1', codigo: 'CEBE-001' }],
  sedes: [{ id: 'sed_1', codigo: 'SED-001' }],
  especialidades: [{ id: 'esp_1', codigo: 'ESP-MEC', nombre: 'Mecánica' }],
  usuarios: [{ id: 'usr_1', nombre: 'Ana Torres', estado: 'activo' }],
};

const duplicadoExistente = validarFilasImportacionCeco([
  { codigo: 'ceco-001', nombre: 'Duplicado', tipo: 'proyecto' },
], catalogos)[0];
assert.match(duplicadoExistente._errores.join(' '), /ya existe en este tenant/);
assert.equal(duplicadoExistente.codigo, 'CECO-001');

const duplicadosArchivo = validarFilasImportacionCeco([
  { codigo: 'cc-x', nombre: 'Uno', tipo: 'proyecto' },
  { codigo: 'CC-X', nombre: 'Dos', tipo: 'temporal' },
], catalogos);
assert.equal(
  duplicadosArchivo.every(row => row._errores.some(error => error.includes('duplicado en el archivo'))),
  true,
);

const referenciasInvalidas = validarFilasImportacionCeco([{
  codigo: 'cc-nuevo',
  nombre: 'Nuevo',
  tipo: 'proyecto',
  cebe_padre: 'no-cebe',
  sede_padre: 'no-sede',
  especialidad: 'no-esp',
  responsable: 'No Existe',
}], catalogos)[0];
assert.equal(referenciasInvalidas._errores.some(error => error.startsWith('CEBE padre inexistente')), true);
assert.equal(referenciasInvalidas._errores.some(error => error.startsWith('Sede padre inexistente')), true);
assert.equal(referenciasInvalidas._errores.some(error => error.startsWith('Especialidad inexistente')), true);
assert.equal(referenciasInvalidas.responsable_id, null);
assert.equal(referenciasInvalidas.responsable_nombre, null);
assert.equal(referenciasInvalidas._advertencias.length, 1);

const referenciasExactas = validarFilasImportacionCeco([{
  codigo: 'cc-ok',
  nombre: 'OK',
  tipo: 'area funcional',
  cebe_padre: 'cebe-001',
  sede_padre: 'sed-001',
  especialidad: 'esp-mec',
  responsable: 'ana torres',
}], catalogos)[0];
assert.deepEqual(
  [referenciasExactas.cebe_id, referenciasExactas.sede_padre, referenciasExactas.especialidad, referenciasExactas.responsable_id],
  ['cb_1', 'sed_1', 'esp_1', 'usr_1'],
);
assert.equal(referenciasExactas._errores.length, 0);

const especialidadPorNombre = validarFilasImportacionCeco([{
  codigo: 'cc-nombre-esp',
  nombre: 'Especialidad por nombre',
  tipo: 'proyecto',
  especialidad: ' mecanica ',
}], catalogos)[0];
assert.equal(especialidadPorNombre.especialidad, 'esp_1');
assert.equal(especialidadPorNombre._errores.length, 0);

const referenciaParcial = validarFilasImportacionCeco([{
  codigo: 'cc-parcial',
  nombre: 'Parcial',
  tipo: 'proyecto',
  cebe_padre: 'CEBE',
  sede_padre: 'SED',
  especialidad: 'Mec',
}], catalogos)[0];
assert.equal(referenciaParcial._errores.filter(error => error.includes('inexistente')).length, 3);

const sedeInvalida = validarFilasImportacionCeco([
  { codigo: 'cc-sede', nombre: 'Sede', tipo: 'sede' },
], catalogos)[0];
assert.equal(sedeInvalida._errores.some(error => error.includes('Tipo inválido')), true);

const cebe = validarFilasImportacionCebe([{
  codigo: 'cebe-nuevo',
  nombre: 'Nuevo',
  tipo: 'cliente',
  cargo_financiero_dbs: 'cliente_contrato',
  modelo_negocio: 'mixto (alquiler + mantenimiento)',
  responsable: 'Nadie',
}], {
  centrosBeneficio: catalogos.centrosBeneficio,
  usuarios: catalogos.usuarios,
  cuentas: [],
})[0];
assert.equal(cebe.codigo, 'CEBE-NUEVO');
assert.equal(cebe.cargo_financiero_dbs, 'Cliente_Contrato');
assert.equal(cebe.modelo_negocio, 'Mixto (alquiler + mantenimiento)');
assert.equal(cebe.responsable_id, null);
assert.equal(cebe.responsable_nombre, null);
assert.equal(cebe._errores.length, 0);

const capitalPropio = validarFilasImportacionCebe([{
  codigo: 'cebe-capital',
  nombre: 'Capital propio',
  tipo: 'linea_servicio',
  cargo_financiero_dbs: 'capital_propio',
}], { centrosBeneficio: [], usuarios: [], cuentas: [] })[0];
assert.equal(capitalPropio.cargo_financiero_dbs, 'Capital_Propio');
assert.equal(capitalPropio._errores.length, 0);

const cargoObligatorio = validarFilasImportacionCebe([{
  codigo: 'cebe-sin-cargo',
  nombre: 'Sin cargo',
  tipo: 'cliente',
}], { centrosBeneficio: [], usuarios: [], cuentas: [] })[0];
assert.deepEqual(cargoObligatorio._errores, ['Cargo financiero DBS obligatorio.']);

const clienteExacto = validarFilasImportacionCebe([{
  codigo: 'cebe-cliente',
  nombre: 'Cliente exacto',
  tipo: 'cliente',
  cargo_financiero_dbs: 'Cliente_Contrato',
  cliente_asociado: ' 20123456789 ',
}], {
  centrosBeneficio: [],
  usuarios: [],
  cuentas: [{ id: 'cta_1', ruc: '20123456789', nombre_comercial: 'Minera Alfa', estado: 'activo' }],
})[0];
assert.equal(clienteExacto.cuenta_id, 'cta_1');
assert.equal(clienteExacto._errores.length, 0);

const clienteParcial = validarFilasImportacionCebe([{
  codigo: 'cebe-cliente-parcial',
  nombre: 'Cliente parcial',
  tipo: 'cliente',
  cargo_financiero_dbs: 'Cliente_Contrato',
  cliente_asociado: 'Alfa',
}], {
  centrosBeneficio: [],
  usuarios: [],
  cuentas: [{ id: 'cta_1', ruc: '20123456789', nombre_comercial: 'Minera Alfa', estado: 'activo' }],
})[0];
assert.equal(clienteParcial.cuenta_id, null);
assert.equal(clienteParcial._errores.some(error => error.startsWith('Cliente asociado inexistente')), true);

const fechasInvalidas = validarFilasImportacionCeco([{
  codigo: 'cc-fechas',
  nombre: 'Fechas',
  tipo: 'temporal',
  fecha_inicio: '2026-02-30',
  fecha_fin: '01/03/2026',
}], catalogos)[0];
assert.equal(fechasInvalidas._errores.filter(error => error.includes('Fecha')).length, 2);

console.log('CECO/CEBE import: validaciones funcionales completadas correctamente.');

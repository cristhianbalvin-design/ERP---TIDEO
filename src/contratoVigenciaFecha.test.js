import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverContratosNominaSociedad, seleccionarContratoPorFecha } from './services/nominaSociedadService.js';

const tipo = { id: 'contrato', nombre: 'Contrato Laboral', captura_snapshot_laboral: true };
const contrato = (id, inicio, fin, extra = {}) => ({
  id, personal_id: 'p1', sociedad_id: 's1', tipo_documento_id: 'contrato',
  estado_validacion: 'aprobado', activo: true, periodo_estado: 'activo',
  fecha_emision: inicio, fecha_vencimiento: fin, version: 1, creado_en: `${inicio}T00:00:00Z`,
  ...extra,
});

test('archivado actual y renovacion futura: elige por fecha', () => {
  const docs = [
    contrato('A', '2026-08-01', '2027-01-31', { activo: false, periodo_estado: 'archivado', contrato_periodo_id: 'periodo-a' }),
    contrato('B', '2027-02-01', '2027-02-28', { activo: true, contrato_periodo_id: 'periodo-b', contrato_periodo_predecesor_id: 'periodo-a' }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19').id, 'A');
  assert.equal(seleccionarContratoPorFecha(docs, '2027-02-10').id, 'B');
});

test('solo la ultima version no rechazada del periodo puede cubrir', () => {
  const docs = [
    contrato('v1', '2026-08-01', '2027-01-31', { contrato_periodo_id: 'periodo', version: 1 }),
    contrato('v2', '2026-09-01', '2027-02-28', { contrato_periodo_id: 'periodo', version: 2 }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-08-15'), null);
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-01').id, 'v2');
});

test('rechazado se ignora y pendiente no cubre', () => {
  assert.equal(seleccionarContratoPorFecha([
    contrato('no', '2026-01-01', '2026-12-31', { estado_validacion: 'rechazado' }),
  ], '2026-10-19'), null);
  assert.equal(seleccionarContratoPorFecha([
    contrato('pend', '2026-01-01', '2026-12-31', { estado_validacion: 'pendiente' }),
  ], '2026-10-19'), null);
});

test('contrato indefinido cubre desde el inicio sin fecha final', () => {
  assert.equal(seleccionarContratoPorFecha([
    contrato('indef', '2026-01-01', '2026-01-31', { es_indefinido: true }),
  ], '2030-01-01').id, 'indef');
});

test('nomina que cruza el relevo elige el contrato con mas dias de interseccion', () => {
  const resultado = resolverContratosNominaSociedad({
    documentos: [
      contrato('A', '2026-08-01', '2027-02-10', { activo: false, periodo_estado: 'archivado', contrato_periodo_id: 'periodo-a' }),
      contrato('B', '2027-02-01', '2027-02-28', { contrato_periodo_id: 'periodo-b', contrato_periodo_predecesor_id: 'periodo-a' }),
    ],
    tiposDocumento: [tipo], sociedadId: 's1',
    periodo: { fecha_inicio: '2027-01-25', fecha_fin: '2027-02-28' },
  });
  assert.equal(resultado.contratos[0].id, 'B');
  assert.deepEqual(resultado.ambiguos[0].contratos, ['B', 'A']);
});

test('R1: un sucesor con la misma fecha de inicio reemplaza al periodo anterior', () => {
  const docs = [
    contrato('P', '2026-05-11', '2026-11-10', { activo: false, periodo_estado: 'archivado', contrato_periodo_id: 'P' }),
    contrato('S', '2026-05-11', '2026-10-10', { contrato_periodo_id: 'S', contrato_periodo_predecesor_id: 'P' }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-09-15').id, 'S');
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19'), null);
});

test('R2: una versión legacy aprobada archivada no cuenta sin periodo', () => {
  const docs = [
    contrato('legacy-v1', '2026-01-01', '2026-12-31', { activo: false, version: 1 }),
    contrato('legacy-v2', '2026-02-01', '2026-12-31', { activo: true, version: 2 }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19').id, 'legacy-v2');
});

test('Mariano: periodo archivado y sucesor por febrero cubren fechas y nóminas correctas', () => {
  const docs = [
    contrato('P', '2026-08-01', '2027-01-31', { activo: false, periodo_estado: 'archivado', contrato_periodo_id: 'P' }),
    contrato('S', '2027-02-01', '2027-02-28', { contrato_periodo_id: 'S', contrato_periodo_predecesor_id: 'P' }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19').id, 'P');
  assert.equal(seleccionarContratoPorFecha(docs, '2027-02-10').id, 'S');
  for (const [mes, esperado] of [['01', 'P'], ['02', 'S']]) {
    const resultado = resolverContratosNominaSociedad({
      documentos: docs, tiposDocumento: [tipo], sociedadId: 's1',
      periodo: { fecha_inicio: `2027-${mes}-01`, fecha_fin: `2027-${mes === '01' ? '31' : '28'}` },
    });
    assert.equal(resultado.contratos[0].id, esperado);
  }
});

test('un sucesor rechazado no suprime al periodo anterior', () => {
  const docs = [
    contrato('P', '2026-08-01', '2027-01-31', { contrato_periodo_id: 'P' }),
    contrato('S-rechazado', '2027-02-01', '2027-02-28', {
      contrato_periodo_id: 'S', contrato_periodo_predecesor_id: 'P', estado_validacion: 'rechazado',
    }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19').id, 'P');
});

test('un sucesor legacy inactivo no suprime un contrato aprobado activo', () => {
  const docs = [
    contrato('activo-X', '2026-07-01', '2026-10-30', {
      activo: true, contrato_periodo_id: 'X', creado_en: '2026-08-10T00:00:00Z',
    }),
    contrato('legacy-inactivo', '2026-08-01', '2026-08-31', {
      activo: false, contrato_periodo_id: 'Y', contrato_periodo_predecesor_id: 'X',
      creado_en: '2026-08-01T00:00:00Z',
    }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19').id, 'activo-X');
});

test('una autoreferencia entre versiones del mismo periodo no suprime la version activa', () => {
  const docs = [
    contrato('v2', '2026-06-01', '2026-11-30', {
      activo: false, contrato_periodo_id: 'X', contrato_periodo_predecesor_id: 'X', version: 2,
    }),
    contrato('v3', '2026-07-01', '2026-12-31', {
      activo: true, contrato_periodo_id: 'X', contrato_periodo_predecesor_id: 'X', version: 3,
    }),
  ];
  assert.equal(seleccionarContratoPorFecha(docs, '2026-10-19').id, 'v3');
});

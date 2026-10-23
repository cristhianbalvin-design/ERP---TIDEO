import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTextoDocumental, valorVariableContratoLaboral } from './lib/variablesDocumentales.js';
import { filtrarPlantillasPorModalidad } from './contratoFirmaService.js';
import { construirContextoRenovacion } from '../supabase/functions/_shared/contratoFirma.js';

const bloquesPlantillaBase631 = [
  'CONTRATO DE TRABAJO - RENOVACIÓN\nConste por el presente documento la renovación del contrato de trabajo que celebran, de una parte, {{empresa.razon_social}}, con RUC {{empresa.ruc}} y domicilio en {{empresa.direccion}}, a quien en adelante se denominará EL EMPLEADOR; y, de la otra parte, {{empleado.nombre}}, identificado(a) con documento de identidad {{empleado.documento}} y domicilio en {{empleado.direccion}}, a quien en adelante se denominará EL TRABAJADOR, en los términos y condiciones siguientes.',
  'PRIMERA: ANTECEDENTES\nEL TRABAJADOR presta servicios para EL EMPLEADOR desde el {{empleado.fecha_ingreso}}. Las partes acuerdan renovar la relación laboral conforme a las condiciones que se detallan en el presente documento.',
  'SEGUNDA: CARGO Y FUNCIONES\nEL TRABAJADOR desempeñará el cargo de {{cargo.nombre}} en el área de {{cargo.area}}, ejecutando las funciones propias del puesto y las que razonablemente se le asignen dentro de su ámbito de competencia.',
  'TERCERA: PLAZO\nEl presente contrato es de tipo {{contrato.tipo}} y tendrá vigencia desde el {{contrato.fecha_inicio}} hasta el {{contrato.fecha_fin}}, salvo que se resuelva anticipadamente conforme a ley.',
  'CUARTA: REMUNERACIÓN\nEL EMPLEADOR abonará a EL TRABAJADOR una remuneración base de {{contrato.moneda}} {{contrato.remuneracion_base}}, sujeta a los descuentos y aportes de ley, más los beneficios que correspondan.',
  'QUINTA: MODALIDAD Y JORNADA\nEL TRABAJADOR prestará sus servicios bajo la modalidad {{contrato.modalidad}}, cumpliendo la jornada y el horario establecidos por EL EMPLEADOR de acuerdo con la normativa vigente y su reglamento interno.',
  'SEXTA: OBLIGACIONES\nEL TRABAJADOR se obliga a cumplir el reglamento interno de trabajo, las políticas de seguridad y salud en el trabajo y las demás normas internas de EL EMPLEADOR, así como a guardar reserva sobre la información confidencial a la que tenga acceso.',
  'SÉPTIMA: FIRMA ELECTRÓNICA\nLas partes acuerdan que el presente contrato se suscribe por medios electrónicos. EL TRABAJADOR declara que accedió al documento mediante un enlace personal y confirmó su identidad con un código de un solo uso enviado a los datos de contacto registrados, y reconoce que su aceptación mediante este procedimiento manifiesta su voluntad y tiene plena validez. La evidencia de la firma (fecha, hora, dirección IP y huella digital del documento) queda registrada y adjunta al documento firmado.',
  'OCTAVA: DISPOSICIONES FINALES\nEn todo lo no previsto en este contrato rigen las disposiciones laborales vigentes. Cualquier controversia se someterá a la jurisdicción de los jueces competentes del domicilio de EL EMPLEADOR.',
];

test('las nueve cláusulas base resuelven sus variables con el contexto del modal', () => {
  const ctx = construirContextoRenovacion({
    empresa: { razon_social: 'Tideo Servicios S.A.C.', ruc: '20123456789', direccion: 'Av. Central 123', moneda_base: 'PEN' },
    persona: { nombre: 'Ana Pérez', documento: '45678912', direccion: 'Jr. Lima 321', fecha_ingreso: '2021-03-15', cargo: 'Analista', area: 'Operaciones', tipo_contrato: 'Plazo fijo', moneda: 'PEN' },
    documento: { condiciones_laborales: { remuneracion_base: 4200, moneda: 'PEN', modalidad: 'Presencial', cargo_nombre: 'Analista', area_nombre: 'Operaciones' } },
    snapshot: { remuneracion_base: 4200, moneda: 'PEN', tipo_contrato: 'Plazo fijo', modalidad: 'Presencial', cargo_nombre: 'Analista', area_nombre: 'Operaciones' },
    fechaInicio: '2026-01-01', fechaFin: '2026-12-31',
  });
  const rendered = bloquesPlantillaBase631.map(block => renderTextoDocumental(block, 'contrato_laboral', ctx));
  const text = rendered.join('\n');
  assert.equal(rendered.length, 9);
  assert.doesNotMatch(text, /\{\{/);
  for (const value of ['Tideo Servicios S.A.C.', '20123456789', 'Ana Pérez', '45678912', 'Analista', '15 de marzo de 2021', '1 de enero de 2026', '31 de diciembre de 2026', '4,200', 'PEN', 'Presencial']) {
    assert.ok(text.includes(value), `falta valor resuelto: ${value}`);
  }
});

test('contexto renovacion prioriza la sociedad y conserva el resultado previo sin sociedad', () => {
  const empresa = { razon_social: 'Grupo', ruc: '20111111111', direccion: 'Direccion grupo' };
  const args = { empresa, persona: {}, documento: {}, fechaInicio: '2026-01-01', fechaFin: '2026-12-31' };
  const contextoAnterior = construirContextoRenovacion(args);
  assert.deepEqual(contextoAnterior, {
    empresa: { ...empresa, razon_social: 'Grupo', ruc: '20111111111', direccion: 'Direccion grupo' },
    empleado: { documento: '', direccion: '', cargo: '', area: '', moneda: 'PEN', modalidad_contrato: '' },
    contrato: { condiciones_laborales: {}, fecha_inicio: '1 de enero de 2026', fecha_fin: '31 de diciembre de 2026', tipo_contrato: '', modalidad: '' },
    condiciones_laborales: {},
    vigencia_efectiva: { fecha_desde: '1 de enero de 2026', fecha_hasta: '31 de diciembre de 2026' },
    cargo: { nombre: '', area: '' },
  });
  const contextoSociedad = construirContextoRenovacion({
    ...args,
    sociedad: { razon_social: 'Empleadora S.A.C.', ruc: '20999999999', direccion_fiscal: 'Av. Legal 456' },
  });
  assert.equal(contextoSociedad.empresa.razon_social, 'Empleadora S.A.C.');
  assert.equal(contextoSociedad.empresa.ruc, '20999999999');
  assert.equal(contextoSociedad.empresa.direccion, 'Av. Legal 456');
});

test('filtra plantillas por modalidad contractual y conserva planilla por defecto', async () => {
  const rows = [
    { id: 'planilla-old' },
    { id: 'laboral', tipos_documento_electronico: { modalidad_contractual: 'planilla' } },
    { id: 'honorarios', tipos_documento_electronico: { modalidad_contractual: 'honorarios' } },
  ];
  assert.deepEqual(filtrarPlantillasPorModalidad(rows, 'planilla').map(r => r.id), ['planilla-old', 'laboral']);
  assert.deepEqual(filtrarPlantillasPorModalidad(rows, 'honorarios').map(r => r.id), ['honorarios']);
});

test('resuelve las variables legales, de jornada, representante y contrato anterior', () => {
  const base = { empresa: { razon_social: 'Empresa' }, persona: {}, documento: {}, snapshot: {
    modalidad_legal: 'Necesidad de mercado', causa_objetiva: 'Demanda temporal verificable', forma_trabajo: 'Mixta',
    regimen_jornada: 'general', horas_diarias: 8, representante: { nombre: 'Ana', documento: '12345678', cargo: 'Gerente' },
    contrato_anterior: { fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31' },
  } };
  const ctx = construirContextoRenovacion(base);
  assert.equal(renderTextoDocumental('{{contrato.modalidad_legal}}', 'contrato_laboral', ctx), 'Necesidad de mercado');
  assert.equal(renderTextoDocumental('{{contrato.causa_objetiva}}', 'contrato_laboral', ctx), 'Demanda temporal verificable');
  assert.equal(renderTextoDocumental('{{contrato.forma_trabajo}}', 'contrato_laboral', ctx), 'mixta');
  assert.equal(renderTextoDocumental('{{jornada.regimen}}', 'contrato_laboral', ctx), 'jornada ordinaria de ocho horas diarias o cuarenta y ocho horas semanales');
  assert.equal(renderTextoDocumental('{{jornada.horas_diarias}}', 'contrato_laboral', ctx), '8');
  assert.equal(renderTextoDocumental('{{empresa.representante_nombre}} / {{empresa.representante_documento}} / {{empresa.representante_cargo}}', 'contrato_laboral', ctx), 'Ana / 12345678 / Gerente');
  assert.equal(renderTextoDocumental('{{contrato.anterior_inicio}} / {{contrato.anterior_fin}}', 'contrato_laboral', ctx), '1 de enero de 2025 / 31 de diciembre de 2025');
  const minero = construirContextoRenovacion({ ...base, snapshot: { ...base.snapshot, regimen_jornada: 'minero_20x10' } });
  assert.equal(renderTextoDocumental('{{jornada.regimen}}', 'contrato_laboral', minero), 'jornada atípica acumulativa de 20 días de trabajo por 10 días de descanso, cuyo promedio no excede el máximo legal');
});

test('fechas de renovacion se expresan legalmente sin desplazar el dia', () => {
  const ctx = construirContextoRenovacion({
    persona: { fecha_ingreso: '2026-01-01' },
    snapshot: { contrato_anterior: { fecha_inicio: '2025-12-31', fecha_fin: '2026-01-01' } },
    fechaInicio: '2026-01-01',
    fechaFin: '2026-12-31',
  });
  assert.equal(renderTextoDocumental('{{empleado.fecha_ingreso}}', 'contrato_laboral', ctx), '1 de enero de 2026');
  assert.equal(renderTextoDocumental('{{contrato.fecha_inicio}} / {{contrato.fecha_fin}}', 'contrato_laboral', ctx), '1 de enero de 2026 / 31 de diciembre de 2026');
  assert.equal(renderTextoDocumental('{{contrato.anterior_inicio}} / {{contrato.anterior_fin}}', 'contrato_laboral', ctx), '31 de diciembre de 2025 / 1 de enero de 2026');
  assert.equal(renderTextoDocumental('{{contrato.fecha_inicio}}', 'contrato_laboral', construirContextoRenovacion({ fechaInicio: '2026-01-01T00:00:00.000Z' })), '1 de enero de 2026');
});

test('normaliza la causa objetiva al construir el contexto y al resolverla', () => {
  const ctx = construirContextoRenovacion({ snapshot: { causa_objetiva: '  Demanda temporal verificable...  ' } });
  assert.equal(ctx.contrato.causa_objetiva, 'Demanda temporal verificable');
  assert.equal(renderTextoDocumental('{{contrato.causa_objetiva}}.', 'contrato_laboral', ctx), 'Demanda temporal verificable.');
  assert.equal(valorVariableContratoLaboral('contrato.causa_objetiva', { condiciones_laborales: { causa_objetiva: ' Demanda temporal verificable. ' } }), 'Demanda temporal verificable');
});

test('sin snapshot las variables nuevas se resuelven vacías y el contexto conserva su forma previa', () => {
  const ctx = construirContextoRenovacion({ empresa: { razon_social: 'Grupo', ruc: '20111111111' }, persona: {}, documento: {}, fechaInicio: '2026-01-01', fechaFin: '2026-12-31' });
  assert.deepEqual(Object.keys(ctx.contrato), ['condiciones_laborales', 'fecha_inicio', 'fecha_fin', 'tipo_contrato', 'modalidad']);
  assert.equal(renderTextoDocumental('{{contrato.modalidad_legal}}|{{contrato.causa_objetiva}}|{{jornada.regimen}}|{{empresa.representante_nombre}}', 'contrato_laboral', ctx), '|||');
  assert.equal(renderTextoDocumental('{{contrato.modalidad}}', 'contrato_laboral', ctx), '');
});

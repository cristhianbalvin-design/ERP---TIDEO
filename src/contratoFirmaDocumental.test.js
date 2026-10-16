import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTextoDocumental } from './lib/variablesDocumentales.js';
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
  for (const value of ['Tideo Servicios S.A.C.', '20123456789', 'Ana Pérez', '45678912', 'Analista', '2021-03-15', '2026-01-01', '2026-12-31', '4,200', 'PEN', 'Presencial']) {
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
    contrato: { condiciones_laborales: {}, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', tipo_contrato: '', modalidad: '' },
    condiciones_laborales: {},
    vigencia_efectiva: { fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31' },
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

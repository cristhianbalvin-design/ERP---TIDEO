import test from 'node:test';
import assert from 'node:assert/strict';
import * as utils from './transporteUtils.js';
import * as busqueda from '../../components/dx/busquedaInteligente.js';

test('estado de vigencia distingue inactiva, futura, vigente y vencida', () => {
  const base = {
    estado: 'activa',
    vigente_desde: '2026-10-01',
    vigente_hasta: null,
  };

  assert.equal(utils.estadoVigencia({ ...base, estado: 'inactiva' }, '2026-10-23'), 'inactiva');
  assert.equal(utils.estadoVigencia({ ...base, vigente_desde: '2026-11-01' }, '2026-10-23'), 'futura');
  assert.equal(utils.estadoVigencia(base, '2026-10-23'), 'vigente');
  assert.equal(utils.estadoVigencia({ ...base, vigente_hasta: '2026-10-22' }, '2026-10-23'), 'vencida');
});

test('formateo, modalidad y validación', () => {
  assert.equal(utils.formatearImporte(4.1234, 'PEN', 'km'), 'S/ 4.1234');
  assert.equal(utils.etiquetaModalidad('viaje'), 'Por viaje');
  assert.ok(utils.validarFormularioTarifa({
    tipo_unidad: 'Camión',
    modalidad: 'viaje',
    ruta_id: 'x',
    tarifa: '10',
    moneda: 'PEN',
    vigente_desde: '2026-01-01',
  }).tarifa === undefined);
});

test('enriquece tarifas sin ruta ni cuenta con etiquetas generales', () => {
  const [tarifa] = utils.enriquecerTarifas([{ ruta_id: null, cuenta_id: null }]);

  assert.equal(tarifa.route_name, 'Todas las rutas');
  assert.equal(tarifa.cuenta_name, 'Tarifa base');
});

test('enriquece tarifa con ruta', () => {
  const [tarifa] = utils.enriquecerTarifas(
    [{ ruta_id: 'ruta-1', cuenta_id: null }],
    [{ id: 'ruta-1', nombre: 'Lima a Cusco' }],
  );

  assert.equal(tarifa.route_name, 'Lima a Cusco');
});

test('enriquece tarifa con cuenta (regresión de cuentaById)', () => {
  const [tarifa] = utils.enriquecerTarifas(
    [{ ruta_id: null, cuenta_id: 'cuenta-1' }],
    [],
    [{ id: 'cuenta-1', nombre_comercial: 'Cliente Uno', razon_social: 'Cliente Uno SAC' }],
  );

  assert.equal(tarifa.cuenta_name, 'Cliente Uno');
});

test('usa Cliente si no se cargó la cuenta de la tarifa', () => {
  const [tarifa] = utils.enriquecerTarifas([{ ruta_id: null, cuenta_id: 'no-cargada' }]);

  assert.equal(tarifa.cuenta_name, 'Cliente');
});

test('decide el motivo de acceso de Transporte Comercial', () => {
  const decidir = utils.decidirMotivoAccesoTransporte;

  assert.equal(decidir('cargando', null, '', null), 'verificando');
  assert.equal(decidir('listo', 'empresa-1', '', null), 'verificando');
  assert.equal(decidir('sin_sesion', null, '', null), 'sin_sesion');
  assert.equal(decidir('sin_empresa', null, '', null), 'sin_empresa');
  assert.equal(decidir('listo', null, '', null), 'sin_empresa');
  assert.equal(decidir('no_configurado', null, '', null), 'no_configurado');
  assert.equal(decidir('listo', 'empresa-1', 'Error de red', null), 'error');
  assert.equal(decidir('listo', 'empresa-1', '', false), 'restringido');
  assert.equal(decidir('listo', 'empresa-1', '', true), null);
});

test('búsqueda normaliza tildes y exige todos los términos en todos los campos', () => {
  const rows = [
    { nombre: 'Lima a Arequipa', km: 90 },
    { nombre: 'Lima Centro', km: 20 },
  ];

  assert.equal(busqueda.filtrarBusquedaInteligente(rows, 'arequipa 90').length, 1);
  assert.equal(busqueda.filtrarBusquedaInteligente([{ nombre: 'José Pérez' }], 'jose perez').length, 1);
  assert.equal(busqueda.filtrarBusquedaInteligente(rows, 'lima lejos').length, 0);
});

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

test('formateo, modalidad y validaci\u00f3n de tarifa correcta', () => {
  assert.equal(utils.formatearImporte(4.1234, 'PEN', 'km'), 'S/ 4.1234');
  assert.equal(utils.etiquetaModalidad('viaje'), 'Por viaje');
  assert.deepEqual(utils.validarFormularioTarifa({
    tipo_unidad: 'Cami\u00f3n',
    modalidad: 'viaje',
    ruta_id: 'x',
    tarifa: '10',
    moneda: 'PEN',
    vigente_desde: '2026-01-01',
    vigente_hasta: '',
    minimo_facturable: '',
  }), {});
});

test('formatea distancias, fechas, datos vacíos y contadores en es-PE', () => {
  assert.equal(utils.formatearNumeroTransporte(1010.0), '1,010');
  assert.equal(utils.formatearNumeroTransporte(1010.5), '1,010.5');
  assert.equal(utils.formatearNumeroTransporte(null), 'Sin dato');
  assert.equal(utils.formatearFechaTransporte('2026-10-27'), '27/10/2026');
  assert.equal(utils.formatearFechaTransporte(''), 'Sin dato');
  assert.equal(utils.formatearFechaTransporte('', 'Sin fecha final'), 'Sin fecha final');
  assert.equal(utils.etiquetaContador(1, 'ruta'), '1 ruta');
  assert.equal(utils.etiquetaContador(2, 'ruta'), '2 rutas');
  assert.equal(utils.etiquetaContador(1, 'tarifa'), '1 tarifa');
  assert.equal(utils.etiquetaContador(0, 'tarifa'), '0 tarifas');
});

test('unifica tipos de unidad sin duplicados de mayúsculas o acentos', () => {
  assert.deepEqual(
    utils.unificarTiposUnidad(['Furgón', 'Camioneta'], ['furgon', 'CAMIONETA', 'Camión 2 ejes']),
    ['Furgón', 'Camioneta', 'Camión 2 ejes'],
  );
});

test('formulario de ruta vac\u00edo devuelve todos los obligatorios', () => {
  assert.deepEqual(utils.validarFormularioRuta({}), {
    codigo: 'Este campo es obligatorio.',
    nombre: 'Este campo es obligatorio.',
    origen_nombre: 'Este campo es obligatorio.',
    destino_nombre: 'Este campo es obligatorio.',
    moneda_peajes: 'Selecciona PEN o USD.',
  });
});

test('tarifa por viaje requiere ruta', () => {
  const errors = utils.validarFormularioTarifa({
    tipo_unidad: 'Camioneta',
    modalidad: 'viaje',
    tarifa: '10',
    moneda: 'PEN',
    vigente_desde: '2026-01-01',
  });

  assert.equal(errors.ruta_id, 'Selecciona una ruta para la modalidad Por viaje.');
});

test('vigente hasta anterior a desde devuelve error en su campo', () => {
  const errors = utils.validarFormularioTarifa({
    tipo_unidad: 'Camioneta',
    modalidad: 'km',
    tarifa: '10',
    moneda: 'PEN',
    vigente_desde: '2026-02-01',
    vigente_hasta: '2026-01-31',
  });

  assert.equal(errors.vigente_hasta, 'La fecha final no puede ser anterior al inicio.');
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

test('cantidad facturable e ingreso estimado siguen la regla SQL del viaje', () => {
  assert.equal(utils.cantidadFacturableViaje('viaje', {}), 1);
  assert.equal(utils.cantidadFacturableViaje('km', { distancia_km: '12.5' }), 12.5);
  assert.equal(utils.cantidadFacturableViaje('tonelada', { peso_toneladas: 2 }), 2);
  assert.equal(utils.cantidadFacturableViaje('hora', { duracion_estimada_horas: null }), null);
  assert.equal(utils.ingresoEstimadoViaje(2.125, 3, 10), 10);
  assert.equal(utils.ingresoEstimadoViaje(2.125, 3, 0), 6.38);
  assert.equal(utils.ingresoEstimadoViaje(null, 1, 0), null);
});

test('agrupa estados, etiqueta y colorea el viaje; conserva las transiciones SQL', () => {
  assert.equal(utils.grupoEstadoViaje('despachado'), 'en_curso');
  assert.equal(utils.grupoEstadoViaje('con_incidente'), 'en_curso');
  assert.equal(utils.grupoEstadoViaje('cancelado'), 'cerrados');
  assert.equal(utils.etiquetaEstadoViaje('en_liquidacion'), 'En liquidación');
  assert.equal(utils.colorEstadoViaje('entregado'), 'is-green');
  assert.deepEqual(utils.accionesPermitidasViaje('borrador'), ['programado','cancelado']);
  assert.deepEqual(utils.accionesPermitidasViaje('programado'), ['despachado','borrador','cancelado']);
  assert.deepEqual(utils.accionesPermitidasViaje('despachado'), ['en_ruta','cancelado']);
  assert.deepEqual(utils.accionesPermitidasViaje('en_ruta'), ['con_incidente','entregado']);
  assert.deepEqual(utils.accionesPermitidasViaje('con_incidente'), ['en_ruta','entregado']);
  assert.deepEqual(utils.accionesPermitidasViaje('entregado'), ['en_liquidacion']);
  assert.deepEqual(utils.accionesPermitidasViaje('en_liquidacion'), ['cerrado','entregado']);
  assert.deepEqual(utils.accionesPermitidasViaje('cerrado'), []);
  assert.deepEqual(utils.accionesPermitidasViaje('cancelado'), []);
});

test('valida formulario de viaje por campo y ordena paradas renumerando secuencia', () => {
  const invalid = utils.validarFormularioViaje({ moneda:'EUR', modalidad:'otro', paradas:[{nombre:''}] });
  assert.ok(invalid.cuenta_id);
  assert.ok(invalid.origen_nombre);
  assert.ok(invalid.moneda);
  assert.ok(invalid.modalidad);
  assert.ok(invalid.parada_0);
  assert.deepEqual(utils.ordenarParadasViaje([{secuencia:3,nombre:'C'},{secuencia:1,nombre:'A'}]), [
    {secuencia:1,nombre:'A'},{secuencia:2,nombre:'C'},
  ]);
});

test('normaliza referencias y números opcionales vacíos del payload del viaje a null', () => {
  const payload = utils.normalizarPayloadViaje({
    os_cliente_id: '', cotizacion_id: '', ruta_id: '', tarifa_id: '', sociedad_id: '',
    transportista_id: '', vehiculo_id: '', conductor_id: '',
    distancia_km: '', duracion_estimada_horas: '', peso_toneladas: '', volumen_m3: '',
    tarifa_unitaria: '', minimo_facturable: '', cantidad_facturable: '',
    paradas: [{ tipo: 'origen', guia_remision_id: '' }],
  });
  for (const key of ['os_cliente_id','cotizacion_id','ruta_id','tarifa_id','sociedad_id','transportista_id','vehiculo_id','conductor_id','distancia_km','duracion_estimada_horas','peso_toneladas','volumen_m3','tarifa_unitaria','minimo_facturable','cantidad_facturable']) assert.equal(payload[key], null, key);
  assert.equal(payload.paradas[0].guia_remision_id, null);
  assert.equal(utils.normalizarPayloadViaje({ distancia_km: '12.5' }).distancia_km, 12.5);
});

test('sincroniza paradas de origen y destino, y mantiene ambas ancladas al ordenar', () => {
  const stops = utils.sincronizarParadasViaje([{ tipo: 'destino', nombre: '' }, { tipo: 'recojo', nombre: 'B' }, { tipo: 'origen', nombre: '' }], 'Lima', 'Cusco');
  assert.deepEqual(stops.map(stop => [stop.tipo, stop.nombre]), [['origen','Lima'],['recojo','B'],['destino','Cusco']]);
  const manual = utils.sincronizarParadasViaje([{ tipo: 'origen', nombre: 'Almacén', nombre_manual: true }, { tipo: 'destino', nombre: 'Cusco' }], 'Lima', 'Arequipa');
  assert.deepEqual(manual.map(stop => [stop.tipo, stop.nombre]), [['origen','Almacén'],['destino','Arequipa']]);
});

test('estima ingreso mensual solo para compromisos y separa monedas usando el mes local', () => {
  const referencia = new Date(2026, 9, 15, 12);
  const viajes = [
    { estado:'programado', fecha_programada:'2026-10-02', moneda:'PEN', ingreso_estimado:1000 },
    { estado:'cancelado', fecha_programada:'2026-10-03', moneda:'PEN', ingreso_estimado:3232 },
    { estado:'borrador', fecha_programada:'2026-10-04', moneda:'PEN', ingreso_estimado:500 },
    { estado:'en_ruta', fecha_programada:'2026-10-05', moneda:'USD', ingreso_estimado:250 },
    { estado:'entregado', fecha_programada:'2026-09-30', moneda:'PEN', ingreso_estimado:99 },
  ];

  assert.deepEqual(utils.ingresoEstimadoMesViajes(viajes, referencia), { PEN:1000, USD:250 });
});

test('convierte hora UTC a hora local y de regreso con offset explícito, sin usar zona de la máquina', () => {
  const utc = '2026-10-28T13:00:00Z';
  const local = utils.fechaUtcAFechaLocalInput(utc, -300);
  assert.equal(local, '2026-10-28T08:00');
  assert.equal(utils.fechaLocalInputAFechaUtc(local, -300), '2026-10-28T13:00:00.000Z');
});

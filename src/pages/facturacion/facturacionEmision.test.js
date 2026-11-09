import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularTotalesEmision,
  estimarDetraccion,
  primerCampoConError,
  validarEmision,
} from './facturacionEmision.js';

const spot037 = { codigo: '037', porcentaje: 12, monto_minimo: 700, umbral_operador: '>' };

test('factura: IGV sobre el subtotal y redondeo a céntimos', () => {
  const t = calcularTotalesEmision({
    partidas: [
      { cantidad: 1, precio_unitario: 4800 },
      { cantidad: 2, precio_unitario: 650 },
    ],
  });
  assert.deepEqual(t, { subtotal: 6100, igv: 1098, total: 7198, montoRetencion: 0, netoCobrable: 7198 });
  const t3 = calcularTotalesEmision({ partidas: [{ cantidad: 3, precio_unitario: 0.335 }] });
  assert.equal(t3.subtotal, 1.01);
  assert.equal(t3.total, Math.round((t3.subtotal + t3.igv) * 100) / 100);
});

test('boleta: el precio ya incluye IGV', () => {
  const t = calcularTotalesEmision({ partidas: [{ cantidad: 1, precio_unitario: 118 }], esBoleta: true });
  assert.deepEqual([t.subtotal, t.igv, t.total], [100, 18, 118]);
});

test('retención del cliente agente', () => {
  const t = calcularTotalesEmision({
    partidas: [{ cantidad: 1, precio_unitario: 3076.27 }],
    retencion: { aplica: true, tasa: 3 },
  });
  assert.equal(t.total, 3630);
  assert.equal(t.montoRetencion, 108.9);
  assert.equal(t.netoCobrable, 3521.1);
});

test('detracción PEN igual que el servidor', () => {
  const d = estimarDetraccion({ tipoDocumento: 'factura', moneda: 'PEN', total: 7198, spot: spot037 });
  assert.equal(d.estado, 'aplica');
  assert.equal(d.baseSoles, 7198);
  assert.equal(d.montoOrigen, 864);
  assert.equal(d.depositoSoles, 864);
  assert.equal(d.netoCliente, 6334);
});

test('detracción USD: depósito en soles y monto de origen en dólares sin mezclar', () => {
  const d = estimarDetraccion({
    tipoDocumento: 'factura',
    moneda: 'USD',
    total: 2403.66,
    tipoCambio: 3.44,
    spot: spot037,
  });
  assert.equal(d.baseSoles, 8268.59);
  assert.equal(d.depositoSoles, 992);
  assert.equal(d.montoOrigen, 288.44);
  assert.equal(d.netoCliente, 2115.22);
});

test('detracción: umbral, boleta y tipo de cambio faltante', () => {
  assert.equal(
    estimarDetraccion({ tipoDocumento: 'factura', moneda: 'PEN', total: 700, spot: spot037 }).estado,
    'bajo_umbral',
  );
  assert.equal(
    estimarDetraccion({
      tipoDocumento: 'factura',
      moneda: 'PEN',
      total: 700,
      spot: { ...spot037, umbral_operador: '>=' },
    }).estado,
    'aplica',
  );
  assert.equal(
    estimarDetraccion({ tipoDocumento: 'boleta', moneda: 'PEN', total: 9000, spot: spot037 }).estado,
    'no_aplica_documento',
  );
  assert.equal(
    estimarDetraccion({ tipoDocumento: 'factura', moneda: 'USD', total: 9000, spot: spot037 }).estado,
    'falta_tipo_cambio',
  );
  assert.equal(estimarDetraccion({ tipoDocumento: 'factura', moneda: 'PEN', total: 9000 }).estado, 'sin_codigo');
});

const base = {
  mode: 'directa',
  cuentaId: 'c1',
  sociedadRequerida: true,
  sociedadId: 's1',
  form: {
    tipo_documento: 'factura',
    numero: 'F001-1',
    fecha_emision: '2026-11-09',
    fecha_vencimiento: '2026-12-09',
    moneda: 'PEN',
    centro_beneficio_id: 'cb',
  },
  partidas: [{ id: 1, descripcion: 'Servicio', cantidad: 1, precio_unitario: 100 }],
  cebe: { id: 'cb', estado: 'activo' },
  cebeVigente: true,
  total: 118,
};

test('validación: formulario completo no tiene errores', () => {
  assert.deepEqual(validarEmision(base), {});
});

test('validación: devuelve todos los errores a la vez', () => {
  const errores = validarEmision({
    ...base,
    cuentaId: '',
    sociedadId: '',
    cebe: null,
    form: { ...base.form, centro_beneficio_id: '', fecha_vencimiento: '2026-11-01' },
    partidas: [{ id: 7, descripcion: '', cantidad: 1, precio_unitario: 0 }],
    total: 0,
  });
  assert.deepEqual(
    Object.keys(errores).sort(),
    ['cebe', 'cliente', 'fecha_vencimiento', 'partida:7:descripcion', 'partida:7:precio', 'sociedad'].sort(),
  );
  assert.equal(primerCampoConError(errores), 'sociedad');
});

test('validación: USD con código SPOT exige tipo de cambio y fuente', () => {
  const errores = validarEmision({
    ...base,
    form: { ...base.form, moneda: 'USD' },
    detraccion: { estado: 'falta_tipo_cambio', spot: spot037 },
    tipoCambioFuente: '',
  });
  assert.ok(errores.tipo_cambio);
  assert.ok(errores.tipo_cambio_fuente);
});

test('validación: retención y detracción que aplica son incompatibles', () => {
  const errores = validarEmision({ ...base, retencionAplica: true, detraccion: { estado: 'aplica', spot: spot037 } });
  assert.match(errores.partidas, /retención y detracción/);
  assert.deepEqual(
    validarEmision({ ...base, retencionAplica: true, detraccion: { estado: 'bajo_umbral', spot: spot037 } }),
    {},
  );
});

test('validación: valorización obligatoria en modo valorización', () => {
  assert.equal(validarEmision({ ...base, mode: 'val', valSel: '' }).valorizacion, 'Selecciona la valorización.');
});

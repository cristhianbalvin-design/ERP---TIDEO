import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularBIComercial, crearCSVBI, filasCSVBI, normalizarFuenteBI, normalizarMonedaBI } from './biComercialMetrics.js';

const seed = () => ({
  periodo: '2026-06', moneda: 'PEN', hoy: '2026-06-30',
  oportunidades: [
    { id: 'p', estado: 'ganada', fecha_creacion: '2026-06-01', fecha_cierre_real: '2026-06-16', moneda: 'PEN', monto_estimado: 900, responsable: 'Ana', cuenta_id: 'c1' },
    { id: 'u', estado: 'ganada', fecha_creacion: '2026-05-01', fecha_cierre_real: '2026-06-10', moneda: '$', monto_estimado: 20 },
    { id: 'open', estado: 'abierta', etapa: 'propuesta', fecha_creacion: '2025-12-01', fecha_cierre_estimada: '2026-06-01', moneda: 'PEN', monto_estimado: 500 },
    { id: 'lost', estado: 'perdida', fecha_creacion: '2026-05-01', fecha_cierre_real: '2026-06-08', moneda: 'PEN', monto_estimado: 10, motivo_perdida: 'Precio' },
  ],
  leads: [
    { id: 'l1', estado: 'nuevo', fecha_creacion: '2026-06-01', fuente: 'campo_movil', dias_sin_actividad: 16 },
    { id: 'l2', estado: 'contacto', fecha_creacion: '2026-06-02', fuente: 'Web' },
    { id: 'l3', estado: 'calificado', fecha_creacion: '2026-06-03', convertido: true, fuente: 'web' },
    { id: 'l4', estado: 'descartado', fecha_creacion: '2026-06-04', motivo_descarte: 'Duplicado' },
    { id: 'l5', estado: 'convertido', fecha_creacion: '2026-06-05' },
  ],
  cuentas: [{ id: 'c1', razon_social: 'Cliente Uno' }],
  historial: [{ opp_id: 'open', etapa_hasta: 'propuesta', creado_en: '2026-06-20' }],
  cotizaciones: [
    { id: 'q1', numero: 'C1', version: 1, estado: 'aprobada', fecha: '2026-06-01', subtotal: 100, moneda: 'PEN' },
    { id: 'q2', numero: 'C1', version: 2, estado: 'aprobada', fecha: '2026-06-10', subtotal: 150, moneda: 'PEN' },
    { id: 'q3', numero: 'C2', version: 1, estado: 'borrador', fecha: '2026-06-10', subtotal: 300, moneda: 'PEN' },
    { id: 'q4', numero: 'C3', version: 1, estado: 'enviada', fecha: '2026-06-10', subtotal: 50, moneda: 'PEN' },
  ],
});

test('filtra los montos por moneda, trata $ como USD y calcula ganadas, ticket y ciclo por cierre real', () => {
  const data = seed(); const result = calcularBIComercial(data);
  assert.equal(result.totalVentas, 900);
  assert.equal(result.cantidadVentas, 1);
  assert.equal(result.ticket, 900);
  assert.equal(result.ciclo, 15);
  assert.equal(normalizarMonedaBI('$'), 'USD');
  assert.equal(calcularBIComercial({ ...data, moneda: 'USD' }).totalVentas, 20);
});
test('activos excluyen descartados y convertidos y embudo cuenta estados avanzados', () => {
  const result = calcularBIComercial(seed());
  assert.equal(result.activos.length, 2);
  assert.deepEqual(result.funnel, { creados: 4, contactados: 3, calificados: 2, convertidos: 2 });
});
test('normaliza fuentes libres', () => {
  assert.deepEqual(['web', 'formulario web', 'campo_movil', 'powerbi_ia_landing', 'linkedin', '', 'mi_fuente'].map(normalizarFuenteBI), ['Web', 'Web', 'Campo móvil', 'Landing Power BI', 'LinkedIn', 'Sin fuente', 'Mi fuente']);
});
test('cotizado usa última versión y excluye borrador', () => {
  const result = calcularBIComercial(seed());
  assert.equal(result.cotizado, 200);
  assert.equal(result.cotizadoAprobado, 150);
  assert.equal(result.cotizacionesTotal, 2);
});
test('abiertas sin filtro mensual incluyen vencimiento y días en etapa', () => {
  const result = calcularBIComercial(seed());
  assert.equal(result.open.length, 1);
  assert.equal(result.open[0].dias_etapa, 10);
  assert.equal(result.open[0].vencida, true);
});
test('agrupa pérdidas por motivo', () => {
  assert.equal(calcularBIComercial(seed()).lostReasons[0].nombre, 'Precio');
});
test('escapa CSV y conserva BOM UTF-8', () => {
  assert.equal(crearCSVBI(['Nombre', 'Detalle'], [['Ana', 'dijo "hola", sí']]), '\uFEFFNombre,Detalle\r\nAna,"dijo ""hola"", sí"');
});
test('construye cabeceras y filas CSV para ventas, leads activos y oportunidades abiertas', () => {
  const result = calcularBIComercial(seed());
  const cliente = row => row.cuenta_id === 'c1' ? 'Cliente Uno' : row.cliente || 'Sin cliente';
  const ventas = filasCSVBI('ventas', result, cliente);
  assert.deepEqual(ventas.headers, ['Oportunidad', 'Cliente', 'Responsable', 'Cierre', 'Origen del monto', 'Monto sin IGV']);
  assert.deepEqual(ventas.rows[0], ['p', 'Cliente Uno', 'Ana', '2026-06-16', 'Monto estimado', 900]);
  const leads = filasCSVBI('leads', result, cliente);
  assert.deepEqual(leads.headers, ['Lead', 'Empresa', 'Responsable', 'Estado', 'Días sin actividad']);
  assert.deepEqual(leads.rows[0], ['Sin nombre', '', 'Por asignar', 'nuevo', 16]);
  const abiertas = filasCSVBI('oportunidades', result, cliente);
  assert.deepEqual(abiertas.headers, ['Oportunidad', 'Cliente', 'Etapa', 'Responsable', 'Días en etapa', 'Vencida', 'Monto sin IGV']);
  assert.deepEqual(abiertas.rows[0], ['open', 'Sin cliente', 'propuesta', 'Por asignar', 10, 'Sí', 500]);
});

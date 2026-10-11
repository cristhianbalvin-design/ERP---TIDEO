import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarTiposDano, construirSvgInforme, normalizarBusquedaTipoDano, posicionarPines, resultadoMedicion, sanitizarSvgCatalogo } from './dibujoHallazgoLogic.js';
import { agruparTiposDano, grupoTipoDano, markupDibujoHallazgo } from './diagnosticoFase2Ui.js';

test('calcula límites inclusivos y acepta coma decimal', () => {
  assert.equal(resultadoMedicion({ minimo: '2,5', maximo: '4.5', medido: '4,5' }), 'dentro');
  assert.equal(resultadoMedicion({ minimo: 2, maximo: 4, medido: 4.1 }), 'fuera');
  assert.equal(resultadoMedicion({ minimo: null, maximo: null, medido: 3 }), null);
});

test('separa el pin del pistón cuando la camisa cubre el cañón', () => {
  const pins = posicionarPines([
    { zona_id: 'vastago', orden: 1, bbox: { x: 0, y: 40, width: 30, height: 30 } },
    { zona_id: 'camisa', orden: 2, bbox: { x: 40, y: 0, width: 100, height: 100 } },
    { zona_id: 'piston', orden: 3, bbox: { x: 85, y: 40, width: 30, height: 30 } },
  ]);
  assert.ok(Math.hypot(pins[1].cx - pins[2].cx, pins[1].cy - pins[2].cy) >= 26);
});

test('sanitiza SVG activo y conserva atributos del catálogo', () => {
  const clean = sanitizarSvgCatalogo('<svg><script>alert(1)</script><foreignObject>x</foreignObject><path data-z="a" data-cota="3" class="z" onclick="x" href="https://bad" style="fill:url(x)"/><image href=javascript:alert(1) /></svg>');
  assert.doesNotMatch(clean, /script|foreignObject|onclick|https:|url\(/i);
  assert.match(clean, /data-z="a"/);
  assert.match(clean, /data-cota="3"/);
  assert.match(clean, /class="z"/);
});

test('genera SVG con estilo y pines numerados', () => {
  const svg = construirSvgInforme({ svg: '<svg viewBox="0 0 100 100"><path data-z="a"/></svg>', zonasMarcadas: [{ zona_id: 'a', orden: 1, bbox: { x: 10, y: 10, width: 30, height: 30 } }], bboxPorZona: {} });
  assert.match(svg, /\.pinned/);
  assert.match(svg, /<text y="\.5">1<\/text>/);
});

test('normaliza acentos y ordena coincidencias del buscador', () => {
  assert.equal(normalizarBusquedaTipoDano(' CORROSIÓN '), ' corrosion '.trim());
  const result = buscarTiposDano([{ codigo: 'fuga', etiqueta: 'fuga' }, { codigo: 'corrosion', etiqueta: 'corrosión' }], 'oxido');
  assert.equal(result.items[0].codigo, 'corrosion');
  assert.equal(result.exacta, false);
  assert.equal(result.parecidos.length, 1);
});

test('clasifica los 47 tipos existentes en los siete grupos aprobados', () => {
  const codes = ['desgaste','rayado','corrosion','fisura_grieta','deformacion','fuga','picadura','golpe_abolladura','holgura_excesiva','rotura','desprendimiento_cromo','sobrecalentamiento','contaminacion','desgaste_abrasivo','desgaste_adhesivo','erosion','cavitacion','fretting','descascarado','estrias','oxidacion','quemado','ovalizacion','conicidad','excentricidad','curvatura','torsion','alabeo','fatiga','porosidad','soldadura_defectuosa','reparacion_previa','rosca_danada','rosca_barrida','chavetero_danado','pernos_flojos','sello_danado','fuga_interna','aceite_degradado','juego_axial','rodamiento_danado','diente_roto','desalineacion','atascamiento','falta_lubricacion','ruido_vibracion','pieza_faltante'];
  assert.equal(codes.length, 47);
  assert.ok(codes.every(code => ['superficie','geometria','materiales','roscas','sellado','mecanico'].includes(grupoTipoDano(code))));
  assert.deepEqual(agruparTiposDano(codes.map(codigo => ({ codigo }))).map(group => group.id), ['frecuentes','superficie','geometria','materiales','roscas','sellado','mecanico']);
});

test('el dibujo presenta zonas seleccionadas y pines con el número de orden', () => {
  const result = markupDibujoHallazgo('<svg viewBox="0 0 100 80"><rect data-z="eje" x="5" y="5" width="40" height="20"/></svg>', [{ zona_id: 'eje' }], { eje: { x: 5, y: 5, width: 40, height: 20 } });
  assert.match(result, /data-z="eje"[^>]*is-marked/);
  assert.match(result, /class="dx-hallazgo-pin"/);
  assert.match(result, /<text y="\.5">1<\/text>/);
});

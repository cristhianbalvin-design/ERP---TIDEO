import test from 'node:test';
import assert from 'node:assert/strict';
import { dividirFrases, hablar, textoParaHablar } from './ariaHabla.js';

test('los montos se leen en soles y dólares', () => {
  assert.equal(textoParaHablar('Total: S/ 63,610.00'), 'Total: 63610 soles');
  assert.equal(textoParaHablar('Saldo US$ 1,250.5'), 'Saldo 1250 dólares con 50 centavos');
  assert.equal(textoParaHablar('Diferencia S/ -12.05'), 'Diferencia menos 12 soles con 5 céntimos');
});

test('quita viñetas, formato y siglas difíciles de pronunciar', () => {
  const texto = textoParaHablar('Tienes **2** pendientes:\n- CxC vencida\n• CxP del día\nOjo: revisa hoy');
  assert.equal(texto, 'Tienes 2 pendientes: cuentas por cobrar vencida. cuentas por pagar del día. Ojo, revisa hoy');
});

test('divide en frases cortas sin perder texto', () => {
  const largo = 'palabra '.repeat(80).trim();
  const partes = dividirFrases(`Hola. ${largo}`);
  assert.equal(partes[0], 'Hola.');
  assert.ok(partes.every(p => p.length <= 200));
  assert.equal(partes.slice(1).join(' '), largo);
});

test('sin síntesis de voz en el entorno, termina de inmediato', () => {
  let fin = 0;
  const detener = hablar('Hola', { onFin: () => { fin++; } });
  detener();
  assert.equal(fin, 1);
});

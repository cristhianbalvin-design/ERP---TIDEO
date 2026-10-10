import assert from 'node:assert/strict';
import test from 'node:test';
import { ejecutarEmisionInformeDosPasos, obtenerMotivoEmisionInforme } from './emisionInformeFlujo.js';

test('el botón permite la emisión conjunta si hay permisos y conclusión confirmada', () => {
  assert.equal(obtenerMotivoEmisionInforme({
    textoConclusion: 'Diagnóstico completo',
    conclusionConfirmada: true,
    conclusionModificada: false,
    permisoInforme: true,
    permisoDiagnostico: true,
  }), '');
});

test('el botón conserva los bloqueos por falta de contenido, confirmación o permiso', () => {
  const base = { conclusionConfirmada: true, conclusionModificada: false, permisoInforme: true, permisoDiagnostico: true };
  assert.equal(obtenerMotivoEmisionInforme({ ...base, textoConclusion: ' ' }), 'Falta redactar el diagnóstico');
  assert.equal(obtenerMotivoEmisionInforme({ ...base, textoConclusion: 'Texto', conclusionConfirmada: false }), 'Falta confirmar la conclusión');
  assert.equal(obtenerMotivoEmisionInforme({ ...base, textoConclusion: 'Texto', permisoDiagnostico: false }), 'No tienes permiso para emitir el diagnóstico.');
  assert.equal(obtenerMotivoEmisionInforme({ ...base, textoConclusion: 'Texto', permisoInforme: false }), 'No tienes permiso para emitir el informe.');
});

test('guarda, emite el diagnóstico y luego el informe en orden', async () => {
  const events = [];
  await ejecutarEmisionInformeDosPasos({
    estadoDiagnostico: 'borrador',
    guardarPendiente: async () => events.push('guardar'),
    emitirDiagnostico: async () => events.push('diagnostico'),
    emitirInforme: async () => { events.push('informe'); return { id: 'informe-1' }; },
  });
  assert.deepEqual(events, ['guardar', 'diagnostico', 'informe']);
});

test('no intenta emitir el informe si falla la emisión del diagnóstico', async () => {
  const events = [];
  await assert.rejects(ejecutarEmisionInformeDosPasos({
    estadoDiagnostico: 'borrador',
    emitirDiagnostico: async () => { events.push('diagnostico'); throw new Error('permiso denegado'); },
    emitirInforme: async () => events.push('informe'),
  }), /permiso denegado/);
  assert.deepEqual(events, ['diagnostico']);
});

test('si falla el informe tras emitir el diagnóstico, indica cómo reintentar', async () => {
  await assert.rejects(ejecutarEmisionInformeDosPasos({
    estadoDiagnostico: 'borrador',
    emitirDiagnostico: async () => {},
    emitirInforme: async () => { throw new Error('RPC no disponible'); },
  }), /El diagnóstico quedó emitido pero el informe no: reintenta Emitir informe\. RPC no disponible/);
});

test('un diagnóstico emitido ejecuta solamente la emisión del informe', async () => {
  let diagnosticoLlamado = false;
  const result = await ejecutarEmisionInformeDosPasos({
    estadoDiagnostico: 'emitido',
    emitirDiagnostico: async () => { diagnosticoLlamado = true; },
    emitirInforme: async () => 'ok',
  });
  assert.equal(diagnosticoLlamado, false);
  assert.equal(result, 'ok');
});

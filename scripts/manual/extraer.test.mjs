import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerDeCodigo, renderExtraccion } from './extraer.mjs';

const codigo = `
export function Pantalla({ puedeCrear }) {
  const perm = a => true;
  const guardar = async () => {
    if (!monto) { addNotificacion('El monto debe ser mayor a cero.'); return; }
    await solpeService.crear({});
    const { data } = await supabase.rpc('crear_solpe', {});
    await supabase.from('solpes').select('*');
    if (!perm('aprobar')) throw new Error('Sin permiso para aprobar');
  };
  return <div>
    {puedeCrear && <button title="Ayuda" onClick={guardar}>Nueva SOLPE</button>}
    <button aria-label="Cerrar panel" onClick={() => {}}><svg /></button>
    <label>Fecha requerida</label>
    <input placeholder="Buscar por número" />
    <table><thead><tr><th>Estado</th></tr></thead></table>
  </div>;
}`;

test('extrae botones con su permiso, campos, mensajes, permisos y datos', () => {
  const r = extraerDeCodigo(codigo);
  assert.deepEqual(r.botones, ['Cerrar panel', 'Nueva SOLPE (solo si puedeCrear)']);
  assert.deepEqual(r.campos, ['Ayuda', 'Buscar por número', 'Cerrar panel', 'Estado', 'Fecha requerida']);
  assert.deepEqual(r.mensajes, ['El monto debe ser mayor a cero.', 'Sin permiso para aprobar']);
  assert.deepEqual(r.permisos, ['perm(aprobar)']);
  assert.deepEqual(r.servicios, ['solpeService.crear']);
  assert.deepEqual(r.rpcs, ['crear_solpe']);
  assert.deepEqual(r.tablas, ['solpes']);
});

test('el informe marca las secciones vacías', () => {
  const texto = renderExtraccion('Prueba', ['a.jsx#A'], extraerDeCodigo('export const A = () => <div />;'));
  assert.match(texto, /## Botones y acciones\n\n- \(ninguno detectado\)/);
  assert.match(texto, /Componentes: a\.jsx#A/);
});

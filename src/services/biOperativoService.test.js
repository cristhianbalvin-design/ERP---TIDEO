import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularBIOperativo, cargarBIOperativo, diasSinParte, fechaLima } from './biOperativoService.js';
const datos = {
  ots: [
    {id:'a', estado:'cerrada', fecha_programada:'2026-09-15', fecha_fin:'2026-10-10', os_cliente_id:'os1', costo_estimado:100},
    {id:'b', estado:'cerrada', fecha_programada:'2026-10-01', fecha_fin:'2026-10-21', os_cliente_id:'os2', costo_estimado:200},
    {id:'c', estado:'ejecucion', fecha_inicio_real:'2026-10-05', avance_pct:60},
    {id:'d', estado:'programada', fecha_programada:'2026-11-01'},
    {id:'e', estado:'anulada', fecha_programada:'2026-10-01'},
  ],
  os:[{id:'os1',fecha_fin:'2026-10-11'},{id:'os2',fecha_fin:'2026-10-20'}],
  partes:[{orden_trabajo_id:'c',fecha:'2026-10-07',estado:'aprobado',horas_normales:8,horas_extra:2},{orden_trabajo_id:'c',fecha:'2026-10-08',estado:'rechazado',horas_normales:99}],
  costos:[{orden_trabajo_id:'a',total:120,mano_obra:30},{orden_trabajo_id:'b',total:180,mano_obra:40}], tareas:[]
};
test('actividad, cierres, avance, entregas, horas y costos del mes', () => {
  const r=calcularBIOperativo(datos,'2026-10','2026-10-10');
  assert.equal(r.actividad.length,3); assert.equal(r.cerradas.length,2); assert.equal(r.avance,60);
  assert.equal(r.aTiempo,1); assert.equal(r.conOS,2); assert.equal(r.normales,8); assert.equal(r.extra,2);
  assert.equal(r.real,300); assert.equal(r.estimado,300); assert.equal(r.real/r.estimado*100,100);
  assert.equal(r.sinParte.length,1); assert.equal(r.sinParte[0].dias,3);
});
test('sin fechas de OS no hay denominador', () => {
  const r=calcularBIOperativo({...datos,os:[]},'2026-10','2026-10-10');
  assert.equal(r.conOS,0); assert.equal(r.aTiempo,0);
});
test('sin partes usa inicio de OT y excluye partes rechazados', () => {
  assert.deepEqual(diasSinParte(datos.ots[2],datos.partes,'2026-10-10'),{ultimo:'2026-10-07',dias:3});
  assert.deepEqual(diasSinParte(datos.ots[2],[],'2026-10-10'),{ultimo:null,dias:5});
});

test('el inicio con hora se interpreta en Lima', () => {
  const r=calcularBIOperativo({ots:[{id:'x',estado:'ejecucion',fecha_inicio_real:'2026-11-01T02:00:00Z'}]},'2026-10','2026-10-31');
  assert.equal(r.actividad.length,1);
});


test('carga la ventana y los ultimos partes actuales en lotes de 200', async () => {
  const consultas = [];
  const ots = Array.from({ length: 201 }, (_, i) => ({
    id: `ot${i}`, estado: i === 0 ? 'ejecucion' : 'programada', sociedad_id: 's1',
    cuenta_id: 'cuenta1', fecha_programada: '2026-10-01',
  }));
  const db = {
    from(tabla) {
      const llamada = { tabla, filtros: [] };
      consultas.push(llamada);
      const query = {
        select(columnas) { llamada.columnas = columnas; return this; },
        eq(...args) { llamada.filtros.push(['eq', ...args]); return this; },
        gte(...args) { llamada.filtros.push(['gte', ...args]); return this; },
        lte(...args) { llamada.filtros.push(['lte', ...args]); return this; },
        lt(...args) { llamada.filtros.push(['lt', ...args]); return this; },
        in(...args) { llamada.filtros.push(['in', ...args]); return this; },
        or(...args) { llamada.filtros.push(['or', ...args]); return this; },
        order(...args) { llamada.filtros.push(['order', ...args]); return this; },
        range(...args) { llamada.filtros.push(['range', ...args]); return this; },
        limit(...args) { llamada.filtros.push(['limit', ...args]); return this; },
        then(resolve) {
          let data = [];
          if (tabla === 'ordenes_trabajo') data = ots;
          if (tabla === 'partes_diarios' && llamada.filtros.some(f => f[0] === 'in' && f[2].includes('ot0'))) {
            data = [
              { id: 'rechazado', orden_trabajo_id: 'ot0', fecha: '2026-11-08', estado: 'rechazado' },
              { id: 'actual', orden_trabajo_id: 'ot0', fecha: '2026-11-07', estado: 'aprobado' },
              { id: 'anterior', orden_trabajo_id: 'ot0', fecha: '2026-01-01', estado: 'aprobado' },
            ];
          }
          if (tabla === 'partes_diarios' && llamada.filtros.some(f => f[0] === 'gte' && f[1] === 'fecha')) {
            data = [{ id: 'mes', orden_trabajo_id: 'ot0', fecha: '2026-10-07', estado: 'aprobado', horas_normales: 8 }];
          }
          resolve({ data, error: null });
        },
      };
      return query;
    },
  };
  const resultado = await cargarBIOperativo('empresa', { sinFiltro: false, sociedadesIds: ['s1'] }, '2026-10', db);
  assert.equal(resultado.ots.length, 201);
  assert.deepEqual(resultado.partes.map(p => p.id), ['mes']);
  assert.deepEqual(resultado.partesActuales.map(p => p.id), ['actual']);
  const indicadores = calcularBIOperativo(resultado, '2026-10', '2026-11-09');
  assert.equal(indicadores.sinParte.length, 0);
  assert.deepEqual(diasSinParte(ots[0], resultado.partesActuales, '2026-11-09'), { ultimo: '2026-11-07', dias: 2 });
  assert.equal(indicadores.normales, 8);
  const actuales = consultas.filter(c => c.tabla === 'partes_diarios' && c.filtros.some(f => f[0] === 'in'));
  assert.deepEqual(actuales.map(c => c.filtros.find(f => f[0] === 'in')[2].length), [200, 1]);
  for (const consulta of actuales) {
    assert.ok(consulta.filtros.some(f => f[0] === 'lte' && f[1] === 'fecha' && f[2] === fechaLima()));
    assert.ok(consulta.filtros.some(f => f[0] === 'order' && f[1] === 'fecha' && f[2].ascending === false));
  }
  assert.ok(consultas.every(c => c.columnas !== '*'));
  const consultaOT = consultas.find(c => c.tabla === 'ordenes_trabajo');
  assert.match(consultaOT.filtros.find(f => f[0] === 'or')[1], /2026-05-01.*2026-10-31/);
  const ventana = consultas.find(c => c.tabla === 'partes_diarios' && c.filtros.some(f => f[0] === 'range'));
  assert.ok(ventana.filtros.some(f => f[0] === 'gte' && f[1] === 'fecha' && f[2] === '2026-05-01'));
  assert.ok(ventana.filtros.some(f => f[0] === 'lte' && f[1] === 'fecha' && f[2] === '2026-10-31'));
  for (const tabla of ['costos_ot', 'ot_tareas']) {
    const lotes = consultas.filter(c => c.tabla === tabla).map(c => c.filtros.find(f => f[0] === 'in')[2].length);
    assert.deepEqual(lotes, [200, 1]);
  }
  assert.equal(consultas.find(c => c.tabla === 'cuentas').columnas, 'id,razon_social');
});

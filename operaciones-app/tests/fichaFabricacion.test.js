import { describe, expect, it } from 'vitest';
import { construirFichaFabricacion, nombreArchivoFicha, toleranciaFicha, totalMaterialFicha, trabajosFicha } from '../src/zahory-mock/pages/fichaFabricacion.js';

const catalogs = {
  familias: [{ id: 'f1', nombre: 'Fabricación de ejes' }],
  tipos: [{ id: 'a1', nombre: 'Torneado' }, { id: 't1', nombre: 'Desbaste' }, { id: 't2', nombre: 'Acabado' }],
};
const piezas = [{
  id: 'p1', nombre: 'Eje', cantidad: 2, consumo_material: 0.8, material_id: 'm1',
  material: { codigo: 'AC-1045', descripcion: 'Barra SAE 1045', unidad: 'm' },
  plano_origen: 'catalogo', componente_catalogo_id: 'c1',
  caracteristicas: [
    { numero: 2, nombre: 'Largo', nominal: '120', unidad: 'mm', tolerancia_menos: '0.1', tolerancia_mas: '+0.2', critica: false, pos_x: 10, pos_y: 20, zona_id: 'z1', medida_id: 'm-largo' },
    { numero: 1, nombre: 'Diámetro', nominal: '50', unidad: 'mm', critica: true, pos_x: 50, pos_y: 50 },
  ],
}];
const dibujos = [{ id: 'c1', nombre: 'Eje escalonado', svg: '<svg></svg>', zonas: [{ id: 'z1', nombre: 'Cuerpo', medidas: [{ id: 'm-largo', nombre: 'Largo', cota: 'L1' }] }] }];
const lineas = [
  { familia_trabajo_id: 'f1', actividad_id: 'a1', tarea_id: 't1', pieza_id: 'p1', horas_mano_obra: 3, orden: 1 },
  { familia_trabajo_id: 'f1', actividad_id: 'a1', tarea_id: 't2', pieza_id: null, horas_mano_obra: 1, orden: 2 },
];

describe('ficha técnica de fabricación', () => {
  it('calcula el material total y la tolerancia con signos', () => {
    expect(totalMaterialFicha({ consumo_material: '0,8', cantidad: 3 })).toBe(2.4);
    expect(totalMaterialFicha({ consumo_material: null, cantidad: 3 })).toBeNull();
    expect(toleranciaFicha({ tolerancia_menos: '-0.1', tolerancia_mas: '0.2' })).toBe('−0.1 / +0.2');
  });

  it('agrupa trabajos sin horas e indica la pieza de cada tarea', () => {
    const trabajos = trabajosFicha(lineas, catalogs, piezas);
    expect(trabajos).toEqual([{ trabajo: 'Fabricación de ejes', actividades: [{ actividad: 'Torneado', tareas: [{ tarea: 'Desbaste', pieza: 'Eje' }, { tarea: 'Acabado', pieza: 'Todas las piezas' }] }] }]);
    expect(JSON.stringify(trabajos)).not.toContain('horas');
  });

  it('arma la ficha con plano marcado, características ordenadas y emisor', () => {
    const llamadas = [];
    const ficha = construirFichaFabricacion({
      piezas, dibujos, lineas, catalogs, borrador: false, conclusion: ' Factible ',
      cabecera: { origen_tipo: 'Recepción', origen_numero: 'REC-001', cliente: 'Minera' },
      emisor: { id: 'per1', nombre: 'Betty', cargo: 'Jefa', firma_bucket: 'firmas', firma_storage_path: 'a.png' },
      marcarDibujo: (svg, zonas, cotas) => { llamadas.push({ zonas, cotas }); return '<svg data-marcado="1"></svg>'; },
    });
    expect(ficha.borrador).toBe(false);
    expect(ficha.piezas[0]).toMatchObject({ nombre: 'Eje', total_material: 1.6, dibujo_nombre: 'Eje escalonado', svg: '<svg data-marcado="1"></svg>' });
    expect(ficha.piezas[0].caracteristicas.map(item => item.numero)).toEqual([1, 2]);
    expect(ficha.piezas[0].caracteristicas[1]).toMatchObject({ parte: 'Cuerpo', nominal: '120 mm', tolerancia: '−0.1 / +0.2' });
    expect(llamadas[0].cotas).toContain('L1');
    expect(ficha.conclusion).toBe('Factible');
    expect(ficha.emisor).toMatchObject({ persona_id: 'per1', nombre: 'Betty', firma_storage_path: 'a.png' });
    expect(nombreArchivoFicha(ficha, 2)).toBe('Ficha-tecnica-REC-001-v2.pdf');
    expect(nombreArchivoFicha(ficha)).toBe('Ficha-tecnica-REC-001-borrador.pdf');
  });

  it('para un plano subido guarda la ruta de la imagen y no un SVG', () => {
    const ficha = construirFichaFabricacion({ piezas: [{ ...piezas[0], plano_origen: 'subido', plano_imagen_ruta: 'emp/dt/p1/x.jpg', componente_catalogo_id: null }], dibujos });
    expect(ficha.piezas[0]).toMatchObject({ plano_imagen_ruta: 'emp/dt/p1/x.jpg', svg: null });
    expect(ficha.borrador).toBe(true);
  });
});

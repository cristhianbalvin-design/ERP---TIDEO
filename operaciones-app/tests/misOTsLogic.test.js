import { describe, expect, it } from 'vitest';
import {
  coincideBusqueda, diasDeAtraso, fechaCorta, filtrarMisOTs, grupoMisOT, nombreLugar, resumenMisOTs, textoHorario,
} from '../src/zahory-mock/pages/misOTsLogic.js';

const HOY = '2026-10-21';
const OTS = [
  { id: '1', numero: 'OT-26-0692', servicio: 'prueba', clienteNombre: 'Andrea SAC', lugarNombre: 'Taller', fecha_programada: '2026-09-14', estado: 'programada' },
  { id: '2', numero: 'OT-26-0382', servicio: 'REPARACIÓN', clienteNombre: 'Andrea SAC', lugarNombre: 'Campamento Operativo Mina 1', fecha_programada: '2026-10-21', estado: 'ejecucion' },
  { id: '3', numero: 'OT-26-0455', servicio: 'MANTTO', clienteNombre: 'TIDEO', lugarNombre: 'Campamento Operativo Mina 1', fecha_programada: '2026-10-23', estado: 'programada' },
  { id: '4', numero: 'OT-26-0999', servicio: 'Sin fecha', clienteNombre: 'TIDEO', lugarNombre: 'Taller', fecha_programada: null, estado: 'programada' },
];

describe('Mis OTs — lógica', () => {
  it('agrupa por fecha frente a hoy (sin fecha cuenta como hoy)', () => {
    expect(OTS.map(ot => grupoMisOT(ot.fecha_programada, HOY))).toEqual(['atrasadas', 'hoy', 'proximas', 'hoy']);
  });

  it('calcula días de atraso y formatea fechas y horario', () => {
    expect(diasDeAtraso('2026-09-14', HOY)).toBe(37);
    expect(diasDeAtraso('2026-10-14', HOY)).toBe(7);
    expect(fechaCorta('2026-09-14')).toBe('14/09/2026');
    expect(textoHorario('08:00:00', '12:00:00')).toBe('08:00 – 12:00');
    expect(textoHorario('14:00:00', null)).toBe('14:00');
    expect(textoHorario(null, null)).toBe('Sin hora estimada');
  });

  it('busca sin tildes en número, servicio, cliente y lugar', () => {
    expect(coincideBusqueda(OTS[1], 'reparacion')).toBe(true);
    expect(coincideBusqueda(OTS[1], 'mina andrea')).toBe(true);
    expect(coincideBusqueda(OTS[0], '0692')).toBe(true);
    expect(coincideBusqueda(OTS[0], 'mina')).toBe(false);
  });

  it('resume y filtra por grupo o en ejecución', () => {
    expect(resumenMisOTs(OTS, HOY)).toEqual({ atrasadas: 1, hoy: 2, proximas: 1, ejecucion: 1 });
    expect(filtrarMisOTs(OTS, { filtro: 'ejecucion' }, HOY).map(o => o.id)).toEqual(['2']);
    expect(filtrarMisOTs(OTS, { filtro: 'hoy', consulta: 'tideo' }, HOY).map(o => o.id)).toEqual(['4']);
  });

  it('muestra el nombre de la sede cuando el lugar es un id', () => {
    const sedes = { sed_fd3c37a6f77847619b: { nombre: 'Campamento Operativo Mina 1' } };
    expect(nombreLugar('sed_fd3c37a6f77847619b', sedes)).toBe('Campamento Operativo Mina 1');
    expect(nombreLugar('Taller', sedes)).toBe('Taller');
    expect(nombreLugar(null, sedes)).toBe('Sin lugar');
  });
});

import { describe, expect, it } from 'vitest';
import {
  armarPayload, contarPorEstado, diferenciaHorometro, fechaCorta, filtrarReportes, formDesdeReporte, formNuevo,
  horometrosValidos, minasDeReportes, puedeEditar, resumenHoras, textoEquipo, validarReporte,
} from '../src/zahory-mock/pages/reportesMinaLogic.js';

const otBase = {
  id: 'ot-1', numero: 'OT-26-0838', avance_pct: 30, horometro_actual: 3500,
  ultimo_reporte: { horometros: { motor: { inicial: 3580, final: 3588.3 }, percusion: { inicial: null, final: null }, electrico: { inicial: 3900, final: 3908.1 } } },
};

function formCompleto() {
  const form = formNuevo({ ot: otBase, tecnico: { id: 'po-1' }, fecha: '2026-10-15' });
  form.horometros.motor.final = '3590.40';
  form.horometros.electrico.final = '3910.2';
  form.horas = { trabajadas: '2.10', prev_programado: '0', preventivo: '0.25', correctivo: '', accidente: '', standby: '9.65' };
  form.estado_equipo = 'operativo';
  form.actividad = 'Se inspeccionó el equipo.';
  return form;
}

describe('reportesMinaLogic', () => {
  it('trae los horómetros iniciales del último reporte del equipo y el avance de la OT', () => {
    const form = formNuevo({ ot: otBase, tecnico: { id: 'po-1' } });
    expect(form.horometros.motor.inicial).toBe('3588.3');
    expect(form.horometros.electrico.inicial).toBe('3908.1');
    expect(form.horometros.percusion.inicial).toBe('');
    expect(form.avance_pct).toBe(30);
    expect(form.tecnico_id).toBe('po-1');
  });

  it('usa el horómetro del activo para motor cuando no hay reporte previo', () => {
    const form = formNuevo({ ot: { ...otBase, ultimo_reporte: null } });
    expect(form.horometros.motor.inicial).toBe('3500');
  });

  it('calcula diferencias de horómetro y detecta finales menores', () => {
    expect(diferenciaHorometro('3588.30', '3590.40')).toBe(2.1);
    expect(diferenciaHorometro('10', '')).toBeNull();
    expect(horometrosValidos({ motor: { inicial: '10', final: '5' } })).toBe(false);
    expect(horometrosValidos({ motor: { inicial: '10', final: '12' } })).toBe(true);
  });

  it('resume el turno: total, disponibilidad mecánica y si cuadra con 12 h', () => {
    const r = resumenHoras({ trabajadas: '2.10', preventivo: '0.25', standby: '9.65' });
    expect(r.total).toBe(12);
    expect(r.cuadra).toBe(true);
    expect(r.dm).toBe(97.9);
    expect(resumenHoras({ trabajadas: '2' }).cuadra).toBe(false);
  });

  it('valida al enviar: horas, estado del equipo, motivo de retorno y trabajos', () => {
    expect(validarReporte(formCompleto(), { enviar: true })).toBe('');
    expect(validarReporte({ ...formCompleto(), horas: { trabajadas: '2' } }, { enviar: true })).toMatch(/deben sumar 12 h/);
    expect(validarReporte({ ...formCompleto(), estado_equipo: '' }, { enviar: true })).toMatch(/estado del equipo/);
    expect(validarReporte({ ...formCompleto(), estado_equipo: 'retorno' }, { enviar: true })).toMatch(/motivo del retorno/);
    expect(validarReporte({ ...formCompleto(), actividad: ' ' }, { enviar: true })).toMatch(/trabajos realizados/);
    expect(validarReporte({ ...formCompleto(), horas: { trabajadas: '2' }, actividad: '' }, { enviar: false })).toBe('');
  });

  it('rechaza horómetros incoherentes y líneas de material repetidas', () => {
    const form = formCompleto();
    form.horometros.motor.final = '3500';
    expect(validarReporte(form, { enviar: false })).toMatch(/final no puede ser menor/);
    const repetido = formCompleto();
    repetido.pedido = [{ material_id: 'm1', codigo: 'A', cantidad: '1' }, { material_id: 'm1', codigo: 'A', cantidad: '2' }];
    expect(validarReporte(repetido, { enviar: true })).toMatch(/No repitas A/);
    const sinCantidad = formCompleto();
    sinCantidad.repuestos = [{ material_id: 'm2', codigo: 'B', cantidad: '0' }];
    expect(validarReporte(sinCantidad, { enviar: true })).toMatch(/mayor a cero/);
  });

  it('exige técnico cuando el usuario no está vinculado a personal operativo', () => {
    expect(validarReporte({ ...formCompleto(), tecnico_id: '' }, { enviar: true, requiereTecnico: true })).toMatch(/técnico/);
  });

  it('arma el payload sin motivo de retorno si el equipo no vuelve a taller', () => {
    const form = { ...formCompleto(), motivo_retorno: 'algo', pedido: [{ material_id: 'm1', cantidad: '1', urgente: 1 }] };
    const payload = armarPayload(form);
    expect(payload.motivo_retorno).toBeNull();
    expect(payload.pedido).toEqual([{ material_id: 'm1', cantidad: '1', urgente: true }]);
    expect(payload.ot_id).toBe('ot-1');
  });

  it('reconstruye el formulario desde un reporte guardado', () => {
    const form = formDesdeReporte({
      id: 'pd-1', numero: 'RM-2026-0001', estado: 'observado', ot_id: 'ot-1', fecha: '2026-10-15', actividad: 'x', avance_pct: 45,
      materiales: [{ tipo: 'repuesto', material_id: 'm1', item_id: 'A', descripcion: 'Grasa', cantidad: 2, unidad: 'UND' }, { tipo: 'fluido', descripcion: 'Grasa', cantidad: 0.25, unidad: 'LB' }],
      datos_mina: { turno: 'noche', horometros: { motor: { inicial: 1, final: 9 } }, horas: { trabajadas: 8, standby: 4 }, lubricantes: [{ tipo: 'Grasa', unidad: 'LB', cantidad: 0.25 }], pedido: [{ material_id: 'm9', codigo: 'K', cantidad: 1, urgente: true }] },
    });
    expect(form.turno).toBe('noche');
    expect(form.horometros.motor).toEqual({ inicial: '1', final: '9' });
    expect(form.repuestos).toHaveLength(1);
    expect(form.lubricantes.find(l => l.tipo === 'Grasa').cantidad).toBe('0.25');
    expect(form.pedido[0].cantidad).toBe('1');
  });

  it('filtra, cuenta y lista minas del listado', () => {
    const reportes = [
      { id: '1', numero: 'RM-1', estado: 'en_revision', mina_id: 'm1', mina_nombre: 'Altiplano', ot_numero: 'OT-1', tecnico_nombre: 'Andre', datos_mina: { turno: 'dia' } },
      { id: '2', numero: 'RM-2', estado: 'aprobado', mina_id: 'm2', mina_nombre: 'Norte', ot_numero: 'OT-2', tecnico_nombre: 'Betty', datos_mina: { turno: 'noche' } },
    ];
    expect(filtrarReportes(reportes, { estado: 'aprobado' }).map(r => r.id)).toEqual(['2']);
    expect(filtrarReportes(reportes, { turno: 'dia' }).map(r => r.id)).toEqual(['1']);
    expect(filtrarReportes(reportes, { busqueda: 'betty' }).map(r => r.id)).toEqual(['2']);
    expect(contarPorEstado(reportes)).toEqual({ '': 2, en_revision: 1, aprobado: 1 });
    expect(minasDeReportes(reportes).map(m => m.nombre)).toEqual(['Altiplano', 'Norte']);
  });

  it('formatea fechas, equipo y permisos de edición', () => {
    expect(fechaCorta('2026-10-14')).toBe('14 oct');
    expect(textoEquipo({ equipo_codigo: 'PC', equipo_marca: 'LENOVO', equipo_modelo: 'PX877' })).toBe('PC · LENOVO PX877');
    expect(puedeEditar({ estado: 'observado', es_propio: true })).toBe(true);
    expect(puedeEditar({ estado: 'en_revision', es_propio: true })).toBe(false);
    expect(puedeEditar({ estado: 'borrador', es_propio: false }, { editar: true })).toBe(true);
  });
});

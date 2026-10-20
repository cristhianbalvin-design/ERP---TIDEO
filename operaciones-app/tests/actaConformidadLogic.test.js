import { describe, expect, it } from 'vitest';
import {
  claveBorradorActa, construirDatosActa, contarFotos, correoValido, datosDispositivo, documentoValido,
  enmascararCorreo, faltantePaso, leerBorrador, mensajeErrorActa, pasoBloqueado, primerPasoIncompleto,
  reglaCierreOT, resumenPartes, serializarBorrador, tareasIncompletas, tipoCobroOT,
} from '../src/zahory-mock/pages/actaConformidadLogic.js';

const H = c => c.repeat(64);
const completo = {
  reglaCierre: { bloqueada: false },
  descripcion: 'Trabajo de prueba',
  fotos: [{ tipo: 'antes', path: 'e/ot/b/a.jpg', sha256: H('1') }, { tipo: 'despues', path: 'e/ot/b/d.jpg', sha256: H('2') }],
  resultado: 'conforme',
  observaciones: '',
  cliente: { nombre: 'Persona Cliente', documento: '40000002', cargo: 'Supervisor', correo: 'cliente@demo.pe' },
  firmaTecnico: 'data:image/png;base64,AAA',
  firmaCliente: 'data:image/png;base64,BBB',
};

describe('actaConformidadLogic', () => {
  it('resume partes y bloquea el cierre como la RPC', () => {
    expect(reglaCierreOT([])).toMatchObject({ bloqueada: true, mensaje: 'Sin partes aprobados' });
    expect(reglaCierreOT([{ estado: 'aprobado' }, { estado: 'en_revision' }])).toMatchObject({ bloqueada: true, mensaje: '1 parte por aprobar' });
    expect(reglaCierreOT([{ estado: 'aprobado' }, { estado: 'rechazado' }])).toMatchObject({ bloqueada: false });
    const r = resumenPartes([{ estado: 'aprobado', horas_normales: 8, horas_extra: 1.5, fecha: '2026-10-02' }, { estado: 'aprobado', horas_normales: 4, fecha: '2026-10-01' }, { estado: 'rechazado', horas_normales: 9 }]);
    expect(r).toMatchObject({ horas: 13.5, fechaInicio: '2026-10-01', fechaFin: '2026-10-02' });
  });

  it('valida cada paso y no deja saltar pasos incompletos', () => {
    expect([0, 1, 2, 3, 4].map(p => faltantePaso(p, completo))).toEqual(['', '', '', '', '']);
    expect(faltantePaso(0, { ...completo, descripcion: '  ' })).toMatch(/Describe/);
    expect(faltantePaso(0, { ...completo, reglaCierre: { bloqueada: true } })).toMatch(/partes/);
    expect(faltantePaso(1, { ...completo, fotos: completo.fotos.slice(0, 1) })).toMatch(/antes y una de después/);
    expect(faltantePaso(1, { ...completo, subiendoFotos: true })).toMatch(/subir/);
    expect(faltantePaso(2, { ...completo, resultado: 'observaciones' })).toMatch(/observaciones/);
    expect(faltantePaso(2, { ...completo, resultado: 'pendiente' })).toMatch(/motivo/);
    expect(faltantePaso(3, { ...completo, firmaTecnico: null })).toMatch(/técnico/);
    expect(faltantePaso(4, { ...completo, cliente: { ...completo.cliente, documento: '12' } })).toMatch(/documento/);
    expect(faltantePaso(4, { ...completo, firmaCliente: null })).toMatch(/firma del cliente/);
    // Pendiente: sin nombre ni firma del cliente, pero con correo.
    const pendiente = { ...completo, resultado: 'pendiente', observaciones: 'No estaba', firmaCliente: null, cliente: { correo: 'c@d.pe' } };
    expect(faltantePaso(4, pendiente)).toBe('');
    expect(faltantePaso(4, { ...pendiente, cliente: { correo: 'mal' } })).toMatch(/correo/);
    expect(primerPasoIncompleto({ ...completo, firmaTecnico: null })).toBe(3);
    expect(pasoBloqueado(5, { ...completo, fotos: [] })).toBe(true);
    expect(pasoBloqueado(1, { ...completo, fotos: [] })).toBe(false);
  });

  it('arma p_datos con fotos, firmas y tareas incompletas', () => {
    const datos = construirDatosActa({ ...completo, cliente: { ...completo.cliente, correo: ' Cliente@Demo.PE ', documento: 'ab12345' } }, {
      tareas: [{ id: 't1', completada: true }, { id: 't2', estado: 'pendiente' }, { id: 't3', estado: 'cerrada_sin_completar' }],
      firmaTecnico: { path: 'e/ot/b/ft.png', sha256: H('3') },
      firmaCliente: { path: 'e/ot/b/fc.png', sha256: H('4') },
    });
    expect(datos).toMatchObject({ resultado: 'conforme', correo_cliente: 'cliente@demo.pe', tareas_incompletas: [{ id: 't2' }], observaciones: null });
    expect(datos.evidencias).toHaveLength(2);
    expect(datos.firma_cliente).toMatchObject({ nombre: 'Persona Cliente', documento: 'AB12345', path: 'e/ot/b/fc.png' });
    const pendiente = construirDatosActa({ ...completo, resultado: 'pendiente', observaciones: 'Ausente' }, { firmaTecnico: {}, firmaCliente: { path: 'x' } });
    expect(pendiente.firma_cliente).toBeNull();
    expect(tareasIncompletas([{ id: 'a', estado: 'completada' }, { id: 'b' }])).toEqual([{ id: 'b' }]);
  });

  it('guarda el borrador sin firmas y lo recupera', () => {
    const texto = serializarBorrador({ ...completo, borradorId: 'borrador-1' });
    expect(texto).not.toContain('base64');
    const leido = leerBorrador(texto);
    expect(leido).toMatchObject({ borradorId: 'borrador-1', descripcion: 'Trabajo de prueba', resultado: 'conforme' });
    expect(leido.fotos).toHaveLength(2);
    expect(leerBorrador('{malo')).toBeNull();
    expect(leerBorrador(JSON.stringify({ version: 2, borradorId: 'x' }))).toBeNull();
    expect(claveBorradorActa('e1', 'ot1')).toBe('opera.acta.borrador.e1.ot1');
  });

  it('utilidades: correo, documento, cobro, errores y dispositivo', () => {
    expect(correoValido('a@b.pe')).toBe(true);
    expect(correoValido('a@b')).toBe(false);
    expect(documentoValido('40000002')).toBe(true);
    expect(documentoValido('4000')).toBe(false);
    expect(enmascararCorreo('supervisor@demo.pe')).toBe('s***@demo.pe');
    expect(tipoCobroOT({ tipo_cobro: null }, { tipo_cobro: 'recurrente_mensual' })).toBe('recurrente_mensual');
    expect(tipoCobroOT({}, null)).toBe('puntual');
    expect(contarFotos(completo.fotos)).toEqual({ antes: 1, despues: 1, total: 2 });
    expect(mensajeErrorActa(new Error('ACTA_FOTOS_MINIMAS: se requiere al menos una foto de antes y una de después.'))).toBe('se requiere al menos una foto de antes y una de después.');
    expect(mensajeErrorActa(new Error('new row violates row-level security policy'))).toMatch(/permiso/);
    const d = datosDispositivo({ navigator: { userAgent: 'UA', platform: 'Android', language: 'es-PE', maxTouchPoints: 5 }, screen: { width: 412, height: 915 }, devicePixelRatio: 2.6 });
    expect(d).toMatchObject({ user_agent: 'UA', plataforma: 'Android', idioma: 'es-PE', pantalla: '412x915', tactil: true, densidad: 2.6 });
  });
});

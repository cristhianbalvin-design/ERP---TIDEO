import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = c => c.repeat(64);
const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'e1', sociedadId: null, estado: 'listo', permiteEscritura: true },
  tablas: {},
  servicio: {},
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({
  getSupabaseClient: () => ({
    from: tabla => {
      const resultado = () => Promise.resolve({ data: mocks.tablas[tabla] ?? [], error: null });
      const builder = {};
      ['select', 'eq', 'in', 'order', 'not', 'limit'].forEach(m => { builder[m] = () => builder; });
      builder.maybeSingle = () => Promise.resolve({ data: (mocks.tablas[tabla] || [])[0] ?? null, error: null });
      builder.then = (ok, ko) => resultado().then(ok, ko);
      return builder;
    },
  }),
}));
vi.mock('../src/services/actaConformidadService.js', () => ({
  cargarContextoActa: (...a) => mocks.servicio.cargarContextoActa(...a),
  descargarComoDataUrl: async () => 'data:image/png;base64,AAA',
  emitirActa: (...a) => mocks.servicio.emitirActa(...a),
  enviarCorreoActa: (...a) => mocks.servicio.enviarCorreoActa(...a),
  guardarPdfActa: (...a) => mocks.servicio.guardarPdfActa(...a),
  nuevoId: () => 'id1',
  obtenerUbicacion: async () => ({ lat: -12.1, lng: -77.03 }),
  quitarFotoBorrador: async () => {},
  subirFirmaActa: async ({ rol, dispositivo, geo }) => ({ path: `e1/ot1/borrador-id1/firma-${rol}.png`, sha256: H(rol === 'tecnico' ? '3' : '4'), dispositivo, geo }),
  subirFotoActa: async ({ tipo }) => ({ tipo, path: `e1/ot1/borrador-id1/${tipo}.jpg`, sha256: H(tipo === 'antes' ? '1' : '2'), tomada_en: '2026-10-20T10:00:00Z', geo: null }),
  urlsFirmadasActa: async () => new Map(),
}));
vi.mock('../src/zahory-mock/pages/ActaConformidadPdf.jsx', () => ({ generarPdfActa: async () => new Blob(['%PDF']) }));
vi.mock('../src/zahory-mock/pages/FirmaTrazo.jsx', () => ({
  FirmaTrazo: ({ etiqueta, onChange }) => <button type="button" aria-label={etiqueta} onClick={() => onChange('data:image/png;base64,FIRMA')}>firmar</button>,
}));

import { CierreConformidadPage } from '../src/zahory-mock/pages/CierreConformidadPage.jsx';

const texto = nodo => (typeof nodo === 'string' ? nodo : (nodo.children || []).map(texto).join(''));
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
const boton = (root, nombre) => root.root.findAll(n => n.type === 'button' && texto(n).trim() === nombre)[0];

async function renderPage() {
  let root;
  await act(async () => { root = TestRenderer.create(<CierreConformidadPage />); await flush(); });
  return root;
}

describe('CierreConformidadPage · acta de conformidad', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
    mocks.sesion = { empresaId: 'e1', sociedadId: null, estado: 'listo', permiteEscritura: true };
    mocks.tablas = {
      ordenes_trabajo: [
        { id: 'ot1', numero: 'OT-26-0001', estado: 'ejecucion', servicio: 'Reparación de luminarias', descripcion: 'Cambio de luminarias', cuenta_id: 'c1', os_cliente_id: null, tipo_cobro: null },
        { id: 'ot2', numero: 'OT-26-0002', estado: 'ejecucion', servicio: 'Limpieza mensual', cuenta_id: 'c1', tipo_cobro: 'recurrente_mensual' },
      ],
      partes_diarios: [
        { id: 'p1', orden_trabajo_id: 'ot1', fecha: '2026-10-19', horas_normales: 8, estado: 'aprobado' },
        { id: 'p2', orden_trabajo_id: 'ot2', fecha: '2026-10-19', horas_normales: 8, estado: 'en_revision' },
      ],
      ot_tareas: [{ id: 't1', ot_id: 'ot1', titulo: 'Cambiar luminarias', estado: 'pendiente', completada: false }],
      cuentas: [{ id: 'c1', razon_social: 'Cliente Demo SAC' }],
      os_clientes: [],
    };
    mocks.servicio = {
      cargarContextoActa: vi.fn().mockResolvedValue({ cliente: { razon_social: 'Cliente Demo SAC' }, os: null, correoContacto: 'contacto@demo.pe', contactoNombre: 'Contacto Demo', contactoCargo: 'Jefe', tecnico: { nombre: 'Técnico Demo', documento: '40000001', cargo: 'Técnico' } }),
      emitirActa: vi.fn().mockResolvedValue({ cierre_id: 'cier_1', acta_numero: 'ACT-26-0001', emitida_en: '2026-10-20T15:00:00Z', conformidad_resultado: 'conforme', snapshot: { evidencias: [], firmas: [] } }),
      guardarPdfActa: vi.fn().mockResolvedValue({ ok: true }),
      enviarCorreoActa: vi.fn().mockResolvedValue({ ok: true }),
    };
  });

  it('lista las OTs en filas accesibles con su estado y tipo de cobro', async () => {
    const root = await renderPage();
    const filas = root.root.findAll(n => n.props?.role === 'button' && String(n.props?.className || '').includes('dx-acta-row'));
    expect(filas.map(f => f.props['aria-label'])).toEqual(['Abrir acta de OT-26-0001', 'Abrir acta de OT-26-0002']);
    const contenido = texto(root.toJSON());
    expect(contenido).toContain('Lista para acta');
    expect(contenido).toContain('1 parte por aprobar');
    expect(contenido).toContain('Recurrente mensual');
    expect(contenido).toContain('Cliente Demo SAC');
  });

  it('no abre el acta si hay partes por aprobar y abre con Enter la OT lista', async () => {
    const root = await renderPage();
    const filas = root.root.findAll(n => n.props?.role === 'button' && String(n.props?.className || '').includes('dx-acta-row'));
    await act(async () => { filas[1].props.onClick(); await flush(); });
    expect(texto(root.toJSON())).toContain('Aprueba sus partes diarios');
    await act(async () => { filas[0].props.onKeyDown({ key: 'Enter', preventDefault() {} }); await flush(); });
    expect(texto(root.root.findByType('h1'))).toBe('OT-26-0001');
    expect(boton(root, 'Siguiente').props.disabled).toBe(false);
  });

  it('recorre los 6 pasos, exige fotos y firmas, y emite con el payload esperado', async () => {
    const root = await renderPage();
    const fila = root.root.findAll(n => n.props?.role === 'button' && String(n.props?.className || '').includes('dx-acta-row'))[0];
    await act(async () => { fila.props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    expect(boton(root, 'Siguiente').props.disabled).toBe(true);
    for (const tipo of ['antes', 'después']) {
      const input = root.root.findByProps({ 'aria-label': `Tomar foto ${tipo}` });
      await act(async () => { input.props.onChange({ target: { files: [new Blob(['x'], { type: 'image/jpeg' })], value: '' } }); await flush(); });
    }
    expect(boton(root, 'Siguiente').props.disabled).toBe(false);
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    expect(boton(root, 'Siguiente').props.disabled).toBe(true);
    await act(async () => { root.root.findByProps({ 'aria-label': 'Área de firma del técnico' }).props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    expect(root.root.findByProps({ id: 'dx-acta-cli-mail' }).props.value).toBe('contacto@demo.pe');
    await act(async () => { root.root.findByProps({ id: 'dx-acta-cli-doc' }).props.onChange({ target: { value: '40000002' } }); await flush(); });
    expect(boton(root, 'Siguiente').props.disabled).toBe(true);
    await act(async () => { root.root.findByProps({ 'aria-label': 'Área de firma del cliente' }).props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    expect(texto(root.toJSON())).toContain('Revisa y emite el acta');
    await act(async () => { boton(root, 'Emitir acta y enviar').props.onClick(); await flush(); await flush(); });

    expect(mocks.servicio.emitirActa).toHaveBeenCalledTimes(1);
    const { empresaId, otId, datos } = mocks.servicio.emitirActa.mock.calls[0][0];
    expect({ empresaId, otId }).toEqual({ empresaId: 'e1', otId: 'ot1' });
    expect(datos).toMatchObject({
      resultado: 'conforme', correo_cliente: 'contacto@demo.pe', tareas_incompletas: [{ id: 't1' }],
      firma_tecnico: { path: 'e1/ot1/borrador-id1/firma-tecnico.png' },
      firma_cliente: { nombre: 'Contacto Demo', documento: '40000002', path: 'e1/ot1/borrador-id1/firma-cliente.png' },
    });
    expect(datos.evidencias.map(e => e.tipo)).toEqual(['antes', 'despues']);
    expect(datos.firma_tecnico.dispositivo).toHaveProperty('hora_dispositivo');
    expect(mocks.servicio.guardarPdfActa).toHaveBeenCalledWith(expect.objectContaining({ cierreId: 'cier_1', numero: 'ACT-26-0001' }));
    expect(mocks.servicio.enviarCorreoActa).toHaveBeenCalledWith({ empresaId: 'e1', cierreId: 'cier_1' });
    const final = texto(root.toJSON());
    expect(final).toContain('Acta ACT-26-0001 emitida');
    expect(final).toContain('Enviado a c***@demo.pe');
    expect(boton(root, 'Descargar PDF')).toBeTruthy();
  });

  it('con conformidad pendiente no pide firma del cliente y ofrece reintentar el correo', async () => {
    mocks.servicio.emitirActa.mockResolvedValue({ cierre_id: 'cier_2', acta_numero: 'ACT-26-0002', conformidad_resultado: 'pendiente', snapshot: { evidencias: [], firmas: [] } });
    mocks.servicio.enviarCorreoActa.mockRejectedValue(new Error('Proveedor de correo no configurado.'));
    const root = await renderPage();
    const fila = root.root.findAll(n => n.props?.role === 'button' && String(n.props?.className || '').includes('dx-acta-row'))[0];
    await act(async () => { fila.props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    for (const tipo of ['antes', 'después']) {
      const input = root.root.findByProps({ 'aria-label': `Tomar foto ${tipo}` });
      await act(async () => { input.props.onChange({ target: { files: [new Blob(['x'], { type: 'image/jpeg' })], value: '' } }); await flush(); });
    }
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    const radio = root.root.findAll(n => n.type === 'input' && n.props.value === 'pendiente')[0];
    await act(async () => { radio.props.onChange(); await flush(); });
    await act(async () => { root.root.findByProps({ id: 'dx-acta-obs' }).props.onChange({ target: { value: 'El supervisor no estaba en sede' } }); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    await act(async () => { root.root.findByProps({ 'aria-label': 'Área de firma del técnico' }).props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    expect(root.root.findAll(n => n.props?.['aria-label'] === 'Área de firma del cliente')).toHaveLength(0);
    await act(async () => { boton(root, 'Siguiente').props.onClick(); await flush(); });
    await act(async () => { boton(root, 'Cerrar OT y enviar enlace').props.onClick(); await flush(); await flush(); });
    expect(mocks.servicio.emitirActa.mock.calls[0][0].datos).toMatchObject({ resultado: 'pendiente', firma_cliente: null, observaciones: 'El supervisor no estaba en sede' });
    expect(texto(root.toJSON())).toContain('Proveedor de correo no configurado.');
    expect(boton(root, 'Reenviar correo')).toBeTruthy();
  });

  it('en solo lectura no permite emitir', async () => {
    mocks.sesion = { ...mocks.sesion, permiteEscritura: false };
    const root = await renderPage();
    expect(texto(root.toJSON())).toContain('solo lectura');
  });
});

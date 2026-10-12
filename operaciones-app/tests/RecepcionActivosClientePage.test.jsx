import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sesion: { empresaId: 'empresa-test', sociedadId: 'sociedad-test', estado: 'listo', permiteEscritura: true, sociedadActiva: { nombre: 'Sociedad de prueba' }, usuario: { id: 'usuario-test' } },
  rpc: vi.fn(),
  informeEmitidos: vi.fn(),
  abrirInformePdf: vi.fn(),
  activos: vi.fn(), clientes: vi.fn(), almacenes: vi.fn(), recepciones: vi.fn(), diagnosticos: vi.fn(),
  cambiarEstado: vi.fn(), crearRecepcion: vi.fn(), crearActivoRecepcion: vi.fn(), asignarComponente: vi.fn(),
  subir: vi.fn(), adjuntos: vi.fn(), urlAdjunto: vi.fn(),
  listarComponentes: vi.fn(),
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.sesion }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../../src/services/storageService.js', () => ({ subirAdjunto: mocks.subir, cargarAdjuntosPorEntidades: mocks.adjuntos, obtenerUrlAdjunto: mocks.urlAdjunto }));
vi.mock('../../src/services/catalogoComponentesService.js', () => ({ catalogoComponentesService: { listar: mocks.listarComponentes } }));
vi.mock('../src/services/diagnosticoTecnicoService.js', () => ({ asignarComponenteCatalogoActivo: mocks.asignarComponente }));
vi.mock('../src/services/informePdfAcciones.js', () => ({ abrirInformePdfDeRecepcion: mocks.abrirInformePdf, listarInformesEmitidosRecepcion: mocks.informeEmitidos }));
vi.mock('../src/services/recepcionesActivosClienteService.js', () => ({
  ESTADOS_CUSTODIA: ['recibido', 'en_diagnostico', 'en_reparacion', 'listo_entrega', 'entregado'],
  listarActivosCliente: mocks.activos, listarClientes: mocks.clientes, listarAlmacenes: mocks.almacenes,
  listarRecepciones: mocks.recepciones, listarEstadosDiagnosticoRecepcion: mocks.diagnosticos,
  actualizarEstadoCustodia: mocks.cambiarEstado, crearRecepcion: mocks.crearRecepcion,
  crearActivoClienteYRecepcion: mocks.crearActivoRecepcion,
}));

import { RecepcionActivosClientePage, resolverAccionDiagnostico } from '../src/zahory-mock/pages/RecepcionActivosClientePage.jsx';

const receiptRows = [
  { id: 'r-none', numero: 'RAC-2026-00001', numero_caso: 1, activo_id: 'a1', fecha_ingreso: '2026-10-01', hora_ingreso: '08:15:00', almacen_id: 'w1', estado_custodia: 'recibido', observaciones: 'Golpe lateral\nChecklist de condición: Integridad exterior verificada: Sí | Sin daños visibles adicionales: No registrado | Accesorios/documentación completos: Sí | Placa o número de serie legible: No registrado' },
  { id: 'r-draft', numero: 'RAC-2026-00002', numero_caso: 2, activo_id: 'a2', fecha_ingreso: '2026-10-02', almacen_id: 'w1', estado_custodia: 'en_diagnostico' },
  { id: 'r-issued', numero: 'RAC-2026-00003', numero_caso: 3, activo_id: 'a3', fecha_ingreso: '2026-10-03', almacen_id: 'w1', estado_custodia: 'listo_entrega' },
  { id: 'r-late-none', numero: 'RAC-2026-00004', numero_caso: 4, activo_id: 'a1', fecha_ingreso: '2026-10-04', almacen_id: 'w1', estado_custodia: 'en_reparacion' },
  { id: 'r-late-draft', numero: 'RAC-2026-00005', numero_caso: 5, activo_id: 'a2', fecha_ingreso: '2026-10-05', almacen_id: 'w1', estado_custodia: 'en_reparacion' },
];

const textOf = node => node.children?.map(child => typeof child === 'string' ? child : child?.children ? textOf(child) : '').join('') || '';
const findButton = (root, label) => root.root.findAllByType('button').find(button => textOf(button).includes(label));
async function renderPage() {
  let root;
  await act(async () => { root = TestRenderer.create(<RecepcionActivosClientePage />); await Promise.resolve(); await Promise.resolve(); });
  return root;
}

beforeEach(() => {
  globalThis.window = { location: { hash: '' }, setTimeout, clearTimeout, open: vi.fn(() => ({ closed: false, location: {}, close: vi.fn() })) };
  mocks.sesion = { empresaId: 'empresa-test', sociedadId: 'sociedad-test', estado: 'listo', permiteEscritura: true, sociedadActiva: { nombre: 'Sociedad de prueba' }, usuario: { id: 'usuario-test' } };
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.activos.mockReset().mockResolvedValue(['a1', 'a2', 'a3'].map((id, index) => ({ id, codigo: `ACT-${index + 1}`, nombre: `Equipo ${index + 1}`, cliente_propietario_id: 'c1', tipo_activo: 'componente' })));
  mocks.clientes.mockReset().mockResolvedValue([{ id: 'c1', razon_social: 'Cliente de prueba' }]);
  mocks.almacenes.mockReset().mockResolvedValue([{ id: 'w1', nombre: 'Almacén de prueba' }]);
  mocks.recepciones.mockReset().mockResolvedValue(receiptRows);
  mocks.informeEmitidos.mockReset().mockResolvedValue({});
  mocks.abrirInformePdf.mockReset().mockResolvedValue({ version: 3, warnings: [] });
  mocks.diagnosticos.mockReset().mockResolvedValue({ 'r-draft': { estado: 'borrador', id: 'd-draft', diagnostico_id: 'd-draft' }, 'r-issued': { estado: 'emitido', id: 'd-issued', diagnostico_id: 'd-issued' }, 'r-late-draft': { estado: 'borrador', id: 'd-late-draft', diagnostico_id: 'd-late-draft' } });
  mocks.cambiarEstado.mockReset().mockImplementation(async (_id, estado) => ({ estado_custodia: estado }));
  mocks.crearRecepcion.mockReset().mockResolvedValue({ ...receiptRows[0], id: 'r-created', numero: 'RAC-2026-00004', numero_caso: 4, activo_id: 'a1' });
  mocks.crearActivoRecepcion.mockReset().mockResolvedValue({ recepcion: { id: 'r-created', numero: 'RAC-2026-00004', numero_caso: 4 }, activo: { id: 'a-new', codigo: 'ACT-NEW', nombre: 'Equipo nuevo', cliente_propietario_id: 'c1', tipo_activo: 'componente' } });
  mocks.asignarComponente.mockReset().mockResolvedValue({});
  mocks.subir.mockReset().mockResolvedValue({});
  mocks.adjuntos.mockReset().mockResolvedValue([{ id: 'photo-1', bucket: 'evidencia', storage_path: 'photo.jpg' }]);
  mocks.urlAdjunto.mockReset().mockResolvedValue('https://example.test/photo.jpg');
  mocks.listarComponentes.mockReset().mockResolvedValue([]);
});

describe('RecepcionActivosClientePage', () => {
  it('resuelve las acciones de diagnostico segun custodia y estado', () => {
    expect(resolverAccionDiagnostico('recibido', null)).toEqual({ tipo: 'iniciar' });
    expect(resolverAccionDiagnostico('en_reparacion', null)).toEqual({ tipo: 'ninguna' });
    expect(resolverAccionDiagnostico('en_reparacion', 'emitido')).toEqual({ tipo: 'ver' });
    expect(resolverAccionDiagnostico('en_reparacion', 'borrador')).toEqual({ tipo: 'borrador-tardio' });
    expect(resolverAccionDiagnostico('en_diagnostico', 'borrador')).toEqual({ tipo: 'continuar' });
  });

  it('muestra el estado sin diagnostico y el enlace tardio al borrador en reparacion', async () => {
    const root = await renderPage();
    expect(rootText(root)).toContain('Sin diagnóstico registrado');
    expect(findButton(root, 'Ver borrador')).toBeTruthy();
    await act(async () => findButton(root, 'Ver borrador').props.onClick({ stopPropagation: vi.fn() }));
    expect(window.location.hash).toContain('trabajo=d-late-draft');
  });
  it('muestra filas, filtra por custodia y busca recepción, activo o cliente', async () => {
    const root = await renderPage();
    expect(root.root.findAllByProps({ role: 'button' }).filter(node => node.props.className?.includes('dx-ui-row'))).toHaveLength(5);
    const tab = root.root.findAllByProps({ role: 'tab' }).find(node => textOf(node).includes('En diagnóstico'));
    await act(async () => tab.props.onClick());
    expect(root.root.findAll(node => node.props.className?.includes('dx-ui-row'))).toHaveLength(1);
    const search = root.root.findByProps({ 'aria-label': 'Buscar por recepción, activo o cliente' });
    await act(async () => search.props.onChange({ target: { value: 'Equipo 2' } }));
    expect(root.root.findAll(node => node.props.className?.includes('dx-ui-row'))).toHaveLength(1);
  });

  it('muestra vacío y sin resultados, y abre una fila con Enter o Espacio', async () => {
    mocks.recepciones.mockResolvedValueOnce([]);
    const empty = await renderPage();
    expect(rootText(empty)).toContain('Aún no hay recepciones');
    const root = await renderPage();
    const search = root.root.findByProps({ 'aria-label': 'Buscar por recepción, activo o cliente' });
    await act(async () => search.props.onChange({ target: { value: 'nada-coincide' } }));
    expect(rootText(root)).toContain('No hay recepciones que coincidan');
    await act(async () => search.props.onChange({ target: { value: '' } }));
    const row = root.root.findAll(node => node.props.className?.includes('dx-ui-row'))[0];
    await act(async () => row.props.onKeyDown({ key: 'Enter', preventDefault: vi.fn() }));
    expect(root.root.findByType('h1').children.join('')).toContain('Caso 1');
    const back = findButton(root, 'Volver a recepciones'); await act(async () => back.props.onClick());
    const rowAgain = root.root.findAll(node => node.props.className?.includes('dx-ui-row'))[0];
    await act(async () => rowAgain.props.onKeyDown({ key: ' ', preventDefault: vi.fn() }));
    expect(root.root.findByType('h1').children.join('')).toContain('Caso 1');
  });

  it('genera enlaces diferentes cuando no hay diagnóstico, hay borrador o fue emitido', async () => {
    const root = await renderPage();
    await act(async () => findButton(root, 'Iniciar diagnóstico').props.onClick({ stopPropagation: vi.fn() }));
    expect(window.location.hash).toContain('recepcion=r-none');
    await act(async () => findButton(root, 'Continuar borrador').props.onClick({ stopPropagation: vi.fn() }));
    expect(window.location.hash).toContain('trabajo=d-draft');
    await act(async () => findButton(root, 'Ver diagnóstico').props.onClick({ stopPropagation: vi.fn() }));
    expect(window.location.hash).toContain('trabajo=d-issued');
  });

  it('abre el PDF del informe cuando el diagn\u00f3stico y el informe est\u00e1n emitidos', async () => {
    mocks.informeEmitidos.mockResolvedValue({ 'r-issued': { version: 3 } });
    const root = await renderPage();
    const pdfButton = findButton(root, 'Informe emitido');
    expect(textOf(pdfButton)).toContain('Ver informe PDF');
    await act(async () => pdfButton.props.onClick({ stopPropagation: vi.fn() }));
    expect(mocks.abrirInformePdf).toHaveBeenCalledWith('r-issued', expect.objectContaining({ closed: false }));
  });

  it('muestra informe secundario junto al borrador en diagnostico y no navega al pulsarlo', async () => {
    mocks.informeEmitidos.mockResolvedValue({ 'r-draft': { version: 2 } });
    const root = await renderPage();
    expect(findButton(root, 'Continuar borrador')).toBeTruthy();
    const secondary = findButton(root, 'Ver informe PDF (v2)');
    expect(secondary).toBeTruthy();
    const stopPropagation = vi.fn();
    await act(async () => secondary.props.onClick({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
    expect(mocks.abrirInformePdf).toHaveBeenCalledWith('r-draft', expect.objectContaining({ closed: false }));
  });

  it('muestra informe secundario junto al borrador tardio en reparacion', async () => {
    mocks.informeEmitidos.mockResolvedValue({ 'r-late-draft': { version: 2 } });
    const root = await renderPage();
    expect(findButton(root, 'Ver borrador')).toBeTruthy();
    expect(findButton(root, 'Ver informe PDF (v2)')).toBeTruthy();
  });

  it('no muestra el enlace secundario cuando no hay informe emitido', async () => {
    const root = await renderPage();
    expect(findButton(root, 'Ver informe PDF (v')).toBeUndefined();
  });

  it('muestra informe secundario en detalle y conserva la disponibilidad del informe', async () => {
    mocks.informeEmitidos.mockResolvedValue({ 'r-draft': { version: 2 } });
    const root = await renderPage();
    const row = root.root.findAll(node => node.props.className?.includes('dx-ui-row')).find(node => textOf(node).includes('RAC-2026-00002'));
    await act(async () => row.props.onClick());
    expect(rootText(root)).toContain('Hay un diagnóstico en borrador asociado a esta recepción. Informe al cliente v2 disponible.');
    expect(findButton(root, 'Ver informe PDF (v2)')).toBeTruthy();
  });

  it('muestra la alerta si falla la generaci\u00f3n del PDF', async () => {
    mocks.informeEmitidos.mockResolvedValue({ 'r-issued': { version: 3 } });
    mocks.abrirInformePdf.mockRejectedValue(new Error('Fall\u00f3 la generaci\u00f3n'));
    const root = await renderPage();
    await act(async () => findButton(root, 'Informe emitido').props.onClick({ stopPropagation: vi.fn() }));
    const alert = root.root.findByProps({ role: 'alert' });
    expect(textOf(alert)).toContain('Fall\u00f3 la generaci\u00f3n');
  });

  it('muestra detalle, parsea checklist y observaciones, carga miniaturas y respeta permisos', async () => {
    const root = await renderPage();
    const row = root.root.findAll(node => node.props.className?.includes('dx-ui-row'))[0];
    await act(async () => row.props.onClick()); await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(rootText(root)).toContain('Golpe lateral');
    expect(rootText(root)).toContain('Sí');
    expect(root.root.findAllByType('img').some(image => image.props.src === 'https://example.test/photo.jpg')).toBe(true);
    expect(mocks.adjuntos).toHaveBeenCalledWith({ empresaId: 'empresa-test', entidadTipo: 'recepciones_activos_cliente', entidadIds: ['r-none'] });
    mocks.sesion = { ...mocks.sesion, permiteEscritura: false };
    const readonly = await renderPage();
    const readonlyRow = readonly.root.findAll(node => node.props.className?.includes('dx-ui-row'))[0];
    await act(async () => readonlyRow.props.onClick());
    expect(readonly.root.findAll(node => node.props.className?.includes('dx-recact-steps'))[0].findAllByType('button').every(button => button.props.disabled)).toBe(true);
  });

  it('valida faltantes, registra la recepción y abre el detalle con aviso y botón de diagnóstico', async () => {
    const root = await renderPage();
    await act(async () => findButton(root, 'Nueva recepción').props.onClick());
    const submit = () => root.root.findAllByType('button').find(button => textOf(button).includes('Registrar recepción') && button.props.type === 'submit');
    expect(submit().props.disabled).toBe(true);
    expect(rootText(root)).toContain('Falta: cliente, almacén, activo');
    const selects = root.root.findAllByType('select');
    await act(async () => selects[0].props.onChange({ target: { value: 'c1' } }));
    const search = root.root.findByProps({ 'aria-label': 'Buscar activo del cliente' });
    await act(async () => search.props.onChange({ target: { value: 'ACT-1' } }));
    await act(async () => findButton(root, 'ACT-1').props.onClick());
    await act(async () => root.root.findAllByType('select')[1].props.onChange({ target: { value: 'w1' } }));
    expect(submit().props.disabled).toBe(false);
    const form = root.root.findByType('form');
    await act(async () => { await form.props.onSubmit({ preventDefault: vi.fn() }); });
    expect(mocks.crearRecepcion).toHaveBeenCalledWith('empresa-test', expect.objectContaining({ activo_id: 'a1', cliente_id: 'c1', almacen_id: 'w1', observaciones: expect.stringContaining('Checklist de condición:') }));
    expect(root.root.findByType('h1').children.join('')).toContain('RAC-2026-00004');
    expect(rootText(root)).toContain('El siguiente paso es el diagnóstico.');
    expect(findButton(root, 'Iniciar diagnóstico')).toBeTruthy();
  });

  it('registra activo nuevo desde el panel con validaciones y limita a ocho fotos', async () => {
    const root = await renderPage();
    await act(async () => findButton(root, 'Nueva recepción').props.onClick());
    await act(async () => root.root.findAllByType('select')[0].props.onChange({ target: { value: 'c1' } }));
    const search = root.root.findByProps({ 'aria-label': 'Buscar activo del cliente' });
    await act(async () => search.props.onChange({ target: { value: 'equipo inexistente' } }));
    await act(async () => findButton(root, 'Registrar como activo nuevo').props.onClick());
    await act(async () => findButton(root, 'Maquinaria completa').props.onClick());
    expect(findButton(root, 'Usar en la recepción')).toBeTruthy();
    await act(async () => findButton(root, 'Usar en la recepción').props.onClick());
    expect(rootText(root)).toContain('La marca es obligatoria');
    const panel = root.root.find(node => node.props.className === 'dx-recact-new-asset');
    const inputs = panel.findAllByType('input');
    await act(async () => inputs[0].props.onChange({ target: { value: 'Equipo de prueba' } }));
    const refreshedPanel = root.root.find(node => node.props.className === 'dx-recact-new-asset');
    const refreshedInputs = refreshedPanel.findAllByType('input');
    await act(async () => refreshedInputs[3].props.onChange({ target: { value: 'Marca de prueba' } }));
    await act(async () => refreshedPanel.findAllByType('input')[4].props.onChange({ target: { value: 'Modelo de prueba' } }));
    await act(async () => findButton(root, 'Usar en la recepción').props.onClick());
    expect(rootText(root)).toContain('Activo nuevo · se creará con la recepción');
    const fileInput = root.root.findByProps({ type: 'file' });
    const selected = Array.from({ length: 10 }, (_, index) => ({ name: `foto-${index}.jpg`, lastModified: index }));
    await act(async () => fileInput.props.onChange({ target: { files: selected }, currentTarget: { value: '' } }));
    expect(rootText(root)).toContain('8 de 8');
    expect(root.root.findAllByType('img')).toHaveLength(8);
    expect(mocks.crearActivoRecepcion).not.toHaveBeenCalled();
    await act(async () => root.root.findAllByType('select')[1].props.onChange({ target: { value: 'w1' } }));
    const form = root.root.findByType('form');
    await act(async () => { await form.props.onSubmit({ preventDefault: vi.fn() }); });
    expect(mocks.crearActivoRecepcion).toHaveBeenCalledWith('empresa-test', expect.objectContaining({ nombre: 'Equipo de prueba', tipo_activo: 'maquinaria_completa', marca: 'Marca de prueba', modelo: 'Modelo de prueba' }));
    expect(mocks.subir).toHaveBeenCalledTimes(8);
    expect(root.root.findByType('h1').children.join('')).toContain('RAC-2026-00004');
  });
});

function rootText(root) { return textOf(root.root); }

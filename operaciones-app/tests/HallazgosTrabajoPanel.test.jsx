import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listarCatalogosHallazgos: vi.fn(),
  crearDiagnosticoHallazgo: vi.fn(),
  actualizarDiagnosticoHallazgo: vi.fn(),
  eliminarDiagnosticoHallazgo: vi.fn(),
  crearDiagnosticoMedicion: vi.fn(),
  actualizarDiagnosticoMedicion: vi.fn(),
  eliminarDiagnosticoMedicion: vi.fn(),
  crearEnlaceDiagnosticoHallazgoLinea: vi.fn(),
  eliminarEnlaceDiagnosticoHallazgoLinea: vi.fn(),
  guardarComponenteCatalogoHallazgo: vi.fn(),
  listarComponentesDiagnostico: vi.fn(),
  obtenerActivoRecepcionDiagnostico: vi.fn(),
  reemplazarZonasHallazgo: vi.fn(),
  crearTipoDanoDiagnostico: vi.fn(),
  usuarioPuedeEditarMaestros: vi.fn(),
  listarFotosHallazgos: vi.fn(),
  actualizarFotoHallazgo: vi.fn(),
  borrarFotoHallazgo: vi.fn(),
  subirFotoHallazgo: vi.fn(),
  asignarComponenteActivo: vi.fn(),
  usuarioPuedeEditarRecepcionActivosCliente: vi.fn(),
}));

vi.mock('../src/services/diagnosticoTecnicoService.js', () => mocks);
vi.mock('../src/services/diagnosticoHallazgoFotosService.js', () => ({
  listarFotosHallazgos: mocks.listarFotosHallazgos,
  actualizarFotoHallazgo: mocks.actualizarFotoHallazgo,
  borrarFotoHallazgo: mocks.borrarFotoHallazgo,
  subirFotoHallazgo: mocks.subirFotoHallazgo,
}));
vi.mock('../src/services/recepcionesActivosClienteService.js', () => ({
  asignarComponenteActivo: mocks.asignarComponenteActivo,
  usuarioPuedeEditarRecepcionActivosCliente: mocks.usuarioPuedeEditarRecepcionActivosCliente,
}));

import { HallazgosTrabajoPanel } from '../src/zahory-mock/pages/HallazgosTrabajoPanel.jsx';

const catalogos = [
  { catalogo: 'tipo_dano', codigo: 'desgaste', etiqueta: 'Desgaste' },
  { catalogo: 'causa_probable', codigo: 'desgaste_normal', etiqueta: 'Desgaste normal' },
  { catalogo: 'unidad_medicion', codigo: 'mm', etiqueta: 'mm' },
];
const line = { id: 'line-1', familia_trabajo_id: 'family-1', tarea_id: 'task-1', cargo_id: 'cargo-1', horas_mano_obra: 2, horas_maquina: 1 };
const baseHallazgo = {
  id: 'hallazgo-1', familia_trabajo_id: 'family-1', componente_parte: 'Vástago', tipo_dano_codigo: 'desgaste',
  causa_probable_codigo: 'desgaste_normal', condicion: 'fuera_de_tolerancia', riesgo: 'antes_de_operar',
  prioridad_calculada: 'P1', prioridad_efectiva: 'P1', accion_recomendada: 'reparar', atribuible_a: 'desgaste_normal',
  incluir_en_informe: true, mediciones: [], lineas: [],
};
const textOf = node => node?.children?.map(child => typeof child === 'string' ? child : textOf(child)).join('') || '';

const renderPanel = async (hallazgos, options = {}) => {
  const callbacks = {};
  let renderer;
  await act(async () => {
    renderer = create(<HallazgosTrabajoPanel
      empresaId="empresa-prueba"
      diagnostico={{ id: 'diagnostico-1', hallazgos }}
      lines={options.lines || [line]}
      familias={options.familias || [{ id: 'family-1', nombre: 'Trabajo 1' }, { id: 'family-2', nombre: 'Trabajo 2' }]}
      extraFamilyIds={options.extraFamilyIds || []}
      onExtraFamilyIdsChange={options.onExtraFamilyIdsChange}
      onCreateFamily={options.onCreateFamily}
      tipos={[{ id: 'task-1', nombre: 'Tarea 1' }]}
      cargos={[{ id: 'cargo-1', nombre: 'Técnico' }]}
      canEdit
      readOnly={false}
      onRegisterSave={save => { callbacks.save = save; }}
      onRegisterAddHallazgo={add => { callbacks.addHallazgo = add; }}
      onRegisterBackToList={back => { callbacks.backToList = back; }}
      onDirtyChange={dirty => { callbacks.dirty = dirty; }}
      onSavingChange={saving => { callbacks.saving = saving; }}
      onError={error => { callbacks.error = error; }}
      onNotice={notice => { callbacks.notice = notice; }}
    />);
    await Promise.resolve();
  });
  return { renderer, callbacks };
};

const openEditor = async renderer => {
  const edit = renderer.root.findAllByType('button').find(button => button.children.join('').trim() === 'Editar');
  if (edit) await act(async () => edit.props.onClick());
};

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.listarCatalogosHallazgos.mockResolvedValue(catalogos);
  mocks.listarComponentesDiagnostico.mockResolvedValue([]);
  mocks.obtenerActivoRecepcionDiagnostico.mockResolvedValue({ tipo_activo: 'maquinaria_completa' });
  mocks.usuarioPuedeEditarMaestros.mockResolvedValue(false);
  mocks.usuarioPuedeEditarRecepcionActivosCliente.mockResolvedValue(false);
  mocks.listarFotosHallazgos.mockResolvedValue([]);
  mocks.actualizarFotoHallazgo.mockImplementation(async values => values);
});

describe('HallazgosTrabajoPanel', () => {
  it('muestra campos de hallazgo, matriz, mediciones y tareas, sin controles fuera de v1', async () => {
    const { renderer } = await renderPanel([{
      id: 'hallazgo-1', familia_trabajo_id: 'family-1', componente_parte: 'Vástago', tipo_dano_codigo: 'desgaste',
      causa_probable_codigo: 'desgaste_normal', condicion: 'fuera_de_tolerancia', riesgo: 'antes_de_operar',
      prioridad_calculada: 'P1', prioridad_efectiva: 'P1', accion_recomendada: 'reparar', atribuible_a: 'desgaste_normal',
      incluir_en_informe: true, mediciones: [], lineas: [{ id: 'link-1', linea_id: 'line-1' }],
    }]);
    await openEditor(renderer);
    const text = textOf(renderer.root);
    expect(text).toContain('Hallazgos del trabajo');
    expect(text).toContain('Condición del componente');
    expect(text).toContain('MATRIZ v1');
    expect(text).toContain('P1 · 1');
    expect(text).toContain('P2 · 0');
    expect(text).toContain('P3 · 0');
    expect(text).toContain('P4 · 0');
    expect(text).toContain('Mediciones');
    expect(text).toContain('Observaciones');
    expect(text).not.toContain('Tareas relacionadas');
    expect(text).not.toContain('Sin tareas relacionadas');
    expect(text).toContain('Fotos');
    expect(text).not.toContain('Aplicar una actividad completa');
    expect(text).not.toContain('Repuesto');
    expect(text).not.toContain('Incluir en informe');
  });

  it('permite agregar un hallazgo solo bajo un trabajo que ya tiene líneas', async () => {
    const { renderer, callbacks } = await renderPanel([]);
    await act(async () => callbacks.addHallazgo());
    expect(renderer.root.findAllByType('input').some(input => input.props.value === '')).toBe(true);
    expect(textOf(renderer.root)).not.toContain('Aplicar una actividad completa');
  });

  it('crea un grupo sin líneas desde una familia existente y permite agregarle un hallazgo', async () => {
    const setExtra = vi.fn();
    const { renderer, callbacks } = await renderPanel([], { lines: [], onExtraFamilyIdsChange: setExtra });
    const addFamily = renderer.root.findAllByType('button').find(button => button.children.join('').includes('Agregar trabajo o componente'));
    await act(async () => addFamily.props.onClick());
    const familySelect = renderer.root.findByProps({ 'aria-label': 'Elegir trabajo o componente' });
    await act(async () => familySelect.props.onChange({ target: { value: 'family-2' } }));
    expect(setExtra).toHaveBeenCalled();
    expect(textOf(renderer.root)).toContain('Trabajo 2');
    await act(async () => callbacks.addHallazgo());
    expect(textOf(renderer.root)).toContain('Nuevo hallazgo');
  });

  it('al elegir una familia que ya tiene grupo lo expande sin solicitar un grupo nuevo', async () => {
    const setExtra = vi.fn();
    const { renderer } = await renderPanel([], { onExtraFamilyIdsChange: setExtra });
    const addFamily = renderer.root.findAllByType('button').find(button => button.children.join('').includes('Agregar trabajo o componente'));
    await act(async () => addFamily.props.onClick());
    const familySelect = renderer.root.findByProps({ 'aria-label': 'Elegir trabajo o componente' });
    await act(async () => familySelect.props.onChange({ target: { value: 'family-1' } }));
    expect(setExtra).not.toHaveBeenCalled();
    expect(textOf(renderer.root)).toContain('Trabajo 1');
  });

  it('permite crear un trabajo o componente y agrega un hallazgo bajo el nuevo grupo', async () => {
    const onCreateFamily = vi.fn().mockResolvedValue({ id: 'family-new', nombre: 'Cilindro' });
    const { renderer } = await renderPanel([], { lines: [], onCreateFamily });
    const open = renderer.root.findAllByType('button').find(button => button.children.join('').includes('Agregar trabajo o componente'));
    await act(async () => open.props.onClick());
    const name = renderer.root.findByProps({ 'aria-label': 'Crear trabajo o componente' });
    await act(async () => name.props.onChange({ target: { value: 'Cilindro' } }));
    const form = renderer.root.findAllByType('form').find(node => node.props.onSubmit);
    await act(async () => { form.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); });
    expect(onCreateFamily).toHaveBeenCalledWith('Cilindro');
    expect(textOf(renderer.root)).toContain('Nuevo hallazgo');
  });

  it('muestra materiales de las tareas enlazadas en solo lectura', async () => {
    const { renderer } = await renderPanel([{ ...baseHallazgo, lineas: [{ id: 'link-1', linea_id: 'line-1' }] }], {
      lines: [{ ...line, materiales: [{ id: 'mat-1', descripcion: 'Filtro', cantidad: 2, unidad: 'und' }] }],
    });
    const text = textOf(renderer.root);
    expect(text).toContain('Filtro · 2 und');
    expect(text).not.toContain('+ Repuesto');
  });

  it('incluye mediciones y tareas sucias en el conteo dirty del panel', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    expect(callbacks.dirty).toBe(true);
  });

  it('guarda un hallazgo nuevo antes de sus mediciones y enlaces', async () => {
    const { renderer, callbacks } = await renderPanel([]);
    await act(async () => callbacks.addHallazgo());
    const componentSelect = renderer.root.findAllByType('select').find(select => select.props['data-required-field'] === 'component');
    await act(async () => componentSelect.props.onChange({ target: { value: 'otro' } }));
    const componentInput = renderer.root.findByProps({ 'aria-label': 'Componente o parte' });
    await act(async () => componentInput.props.onChange({ target: { value: 'Vástago' } }));
    const damage = renderer.root.findByProps({ role: 'combobox', 'aria-label': 'Tipo de daño' });
    await act(async () => { damage.props.onFocus(); damage.props.onChange({ target: { value: 'Desgaste' } }); });
    const damageOption = renderer.root.findAllByType('button').find(button => button.children.join('') === 'Desgaste');
    await act(async () => damageOption.props.onClick());
    const cause = renderer.root.findAllByType('select').find(select => select.props['aria-label'] === 'Causa probable');
    await act(async () => cause.props.onChange({ target: { value: 'desgaste_normal' } }));
    mocks.crearDiagnosticoHallazgo.mockResolvedValue({ id: 'hallazgo-new', prioridad_calculada: 'P4', prioridad_efectiva: 'P4' });
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoHallazgo).toHaveBeenCalled();
    expect(mocks.crearDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(mocks.crearEnlaceDiagnosticoHallazgoLinea).not.toHaveBeenCalled();
    expect(callbacks.notice).toBe('Hallazgos guardados.');
  });

  it('no llama al servicio si faltan campos obligatorios', async () => {
    const { renderer, callbacks } = await renderPanel([]);
    await act(async () => callbacks.addHallazgo());
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoHallazgo).not.toHaveBeenCalled();
    expect(callbacks.error).toContain('Hay 1 hallazgo incompleto. Complétalos o elimínalos.');
  });

  it('valida el parámetro de cada medición y no envía la medición incompleta', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(mocks.actualizarDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(callbacks.error).toContain('Escribe el parámetro de la medición 1.');
    expect(callbacks.error).not.toContain('unidad no pertenece a empresa_id');
    expect(callbacks.notice).toContain('Guardado parcial');
  });

  it('valida la unidad de cada medición y no envía la medición incompleta', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    const measurementParam = renderer.root.findAllByType('input').find(input => input.props.value === '');
    await act(async () => measurementParam.props.onChange({ target: { value: 'Presión' } }));
    await act(async () => callbacks.save());
    expect(mocks.crearDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(mocks.actualizarDiagnosticoMedicion).not.toHaveBeenCalled();
    expect(callbacks.error).toContain('Elige la unidad de la medición 1.');
    expect(callbacks.error).not.toContain('unidad no pertenece a empresa_id');
    expect(callbacks.notice).toContain('Guardado parcial');
  });

  it('expone guardado parcial y oculta el error crudo si falla una medición', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.join('').includes('+ Medición')).props.onClick());
    const measurementParam = renderer.root.findAllByType('input').find(input => input.props.value === '');
    await act(async () => measurementParam.props.onChange({ target: { value: 'Presión' } }));
    const measurementUnit = renderer.root.findAllByType('select').at(-1);
    await act(async () => measurementUnit.props.onChange({ target: { value: 'mm' } }));
    mocks.actualizarDiagnosticoHallazgo.mockResolvedValue({ id: 'hallazgo-1' });
    mocks.crearDiagnosticoMedicion.mockRejectedValue(new Error('unidad no pertenece a empresa_id'));
    await act(async () => callbacks.save());
    expect(mocks.actualizarDiagnosticoHallazgo).toHaveBeenCalled();
    expect(mocks.crearDiagnosticoMedicion).toHaveBeenCalled();
    expect(callbacks.error).toContain('Guardado parcial');
    expect(callbacks.error).not.toContain('unidad no pertenece a empresa_id');
  });

  it('carga fotos del hallazgo y persiste desde el control de inclusión del informe', async () => {
    mocks.listarFotosHallazgos.mockResolvedValue([{ id: 'foto-1', hallazgo_id: 'hallazgo-1', signedUrl: 'https://signed/foto.jpg', ruta_storage: 'e/d/h/f.jpg', leyenda: 'Sello', excluir_del_informe: false }]);
    const { renderer } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    expect(mocks.listarFotosHallazgos).toHaveBeenCalledWith('empresa-prueba', ['hallazgo-1']);
    expect(renderer.root.findByProps({ src: 'https://signed/foto.jpg' }).props.alt).toBe('Sello');
    const fotoLabel = renderer.root.findAll(node => node.type === 'label' && textOf(node).includes('Incluir en el informe')).at(-1);
    const checkbox = fotoLabel.findByType('input');
    await act(async () => { checkbox.props.onChange({ target: { checked: false } }); await Promise.resolve(); });
    expect(mocks.actualizarFotoHallazgo).toHaveBeenCalledWith({ empresaId: 'empresa-prueba', id: 'foto-1', leyenda: 'Sello', excluir_del_informe: true });
    renderer.unmount();
  });

  it('mantiene enlaces de tareas existentes al guardar observaciones sin mostrarlos en la UI', async () => {
    const { renderer, callbacks } = await renderPanel([{ ...baseHallazgo, lineas: [{ id: 'link-1', linea_id: 'line-1' }] }]);
    await openEditor(renderer);
    expect(textOf(renderer.root)).not.toContain('Tareas relacionadas');
    const textarea = renderer.root.findAllByType('textarea').find(node => node.props.maxLength === 1000);
    await act(async () => textarea.props.onChange({ target: { value: 'Vibración anormal' } }));
    mocks.actualizarDiagnosticoHallazgo.mockResolvedValue({ id: 'hallazgo-1', observacion: 'Vibración anormal' });
    await act(async () => { await callbacks.save(); });
    expect(mocks.actualizarDiagnosticoHallazgo).toHaveBeenCalledWith('empresa-prueba', 'diagnostico-1', expect.objectContaining({ observacion: 'Vibración anormal' }));
    expect(mocks.crearEnlaceDiagnosticoHallazgoLinea).not.toHaveBeenCalled();
    expect(mocks.eliminarEnlaceDiagnosticoHallazgoLinea).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('permite buscar y elegir un tipo de daño desde el combobox', async () => {
    const { renderer } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    const damage = renderer.root.findByProps({ role: 'combobox', 'aria-label': 'Tipo de daño' });
    await act(async () => { damage.props.onFocus(); damage.props.onChange({ target: { value: 'Desgaste' } }); });
    const option = renderer.root.findAllByType('button').find(button => button.children.join('') === 'Desgaste');
    await act(async () => option.props.onClick());
    expect(renderer.root.findByProps({ role: 'combobox', 'aria-label': 'Tipo de daño' }).props.value).toBe('Desgaste');
    renderer.unmount();
  });

  it('permite crear y seleccionar un tipo de daño nuevo con permiso de maestros', async () => {
    mocks.usuarioPuedeEditarMaestros.mockResolvedValue(true);
    mocks.crearTipoDanoDiagnostico.mockResolvedValue({
      catalog: [{ catalogo: 'tipo_dano', codigo: 'picadura', etiqueta: 'Picadura' }],
      valor: { codigo: 'picadura' },
    });
    const { renderer } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    const damage = renderer.root.findByProps({ role: 'combobox', 'aria-label': 'Tipo de daño' });
    await act(async () => { damage.props.onFocus(); damage.props.onChange({ target: { value: 'Picadura' } }); });
    const create = renderer.root.findAllByType('button').find(button => button.children.join('').includes('Crear «Picadura»'));
    await act(async () => { await create.props.onClick(); });
    expect(mocks.crearTipoDanoDiagnostico).toHaveBeenCalledWith('empresa-prueba', 'Picadura');
    expect(renderer.root.findByProps({ role: 'combobox', 'aria-label': 'Tipo de daño' }).props.value).toBe('Picadura');
    renderer.unmount();
  });

  it('conserva cambios al alternar lista y editor', async () => {
    const { renderer, callbacks } = await renderPanel([baseHallazgo]);
    await openEditor(renderer);
    const observations = renderer.root.findAllByType('textarea').find(node => node.props.maxLength === 1000);
    await act(async () => observations.props.onChange({ target: { value: 'Pin de fuga' } }));
    await act(async () => callbacks.backToList());
    expect(renderer.root.findAllByProps({ className: 'dx-finding-list-row' })).toHaveLength(1);
    await openEditor(renderer);
    expect(renderer.root.findAllByType('textarea').find(node => node.props.maxLength === 1000).props.value).toBe('Pin de fuga');
    renderer.unmount();
  });

  it('marca zonas del dibujo y crea los pines correspondientes', async () => {
    mocks.listarComponentesDiagnostico.mockResolvedValue([{
      id: 'component-1', nombre: 'Bomba', svg: '<svg viewBox="0 0 100 100"><rect data-z="zone-1" x="10" y="10" width="50" height="50" /></svg>',
      zonas: [{ id: 'zone-1', nombre: 'Carcasa', medidas: [] }],
    }]);
    const { renderer, callbacks } = await renderPanel([{ ...baseHallazgo, componente_catalogo_id: 'component-1' }]);
    await openEditor(renderer);
    const drawing = renderer.root.findByProps({ role: 'group', 'aria-label': 'Dibujo de Bomba' });
    await act(async () => drawing.props.onClick({ target: { closest: () => ({ getAttribute: () => 'zone-1' }) } }));
    expect(renderer.root.findByProps({ 'aria-label': 'Nota del pin 1' })).toBeTruthy();
    expect(textOf(renderer.root)).toContain('Carcasa');
    await act(async () => callbacks.save());
    expect(mocks.reemplazarZonasHallazgo).toHaveBeenCalledWith('empresa-prueba', 'hallazgo-1', 'component-1', [expect.objectContaining({ zona_id: 'zone-1' })]);
    renderer.unmount();
  });

  it('corrige el tipo del activo desde el hallazgo cuando existe permiso de editar recepción', async () => {
    mocks.usuarioPuedeEditarRecepcionActivosCliente.mockResolvedValue(true);
    mocks.listarComponentesDiagnostico.mockResolvedValue([
      { id: 'component-1', nombre: 'Bomba', svg: '<svg viewBox="0 0 10 10" />', zonas: [] },
      { id: 'component-2', nombre: 'Motor', svg: '<svg viewBox="0 0 10 10" />', zonas: [] },
    ]);
    mocks.obtenerActivoRecepcionDiagnostico.mockResolvedValue({ id: 'asset-1', nombre: 'Activo 1', tipo_activo: 'componente', componente_catalogo_id: 'component-1' });
    const { renderer } = await renderPanel([{ ...baseHallazgo, componente_catalogo_id: 'component-1' }]);
    await openEditor(renderer);
    const correct = renderer.root.findAllByType('button').find(button => button.children.join('') === 'Corregir tipo');
    expect(correct).toBeTruthy();
    await act(async () => correct.props.onClick());
    const select = renderer.root.findByProps({ id: 'dx-componente-correcto' });
    await act(async () => select.props.onChange({ target: { value: 'component-2' } }));
    await act(async () => { await renderer.root.findAllByType('button').find(button => button.children.join('') === 'Guardar tipo').props.onClick(); });
    expect(mocks.asignarComponenteActivo).toHaveBeenCalledWith('empresa-prueba', 'asset-1', 'component-2');
    expect(textOf(renderer.root)).toContain('Motor');
    renderer.unmount();
  });

  it('oculta Corregir tipo si el usuario no puede editar la recepción', async () => {
    mocks.listarComponentesDiagnostico.mockResolvedValue([{ id: 'component-1', nombre: 'Bomba' }]);
    mocks.obtenerActivoRecepcionDiagnostico.mockResolvedValue({ id: 'asset-1', tipo_activo: 'componente', componente_catalogo_id: 'component-1' });
    const { renderer } = await renderPanel([{ ...baseHallazgo, componente_catalogo_id: 'component-1' }]);
    await openEditor(renderer);
    expect(renderer.root.findAllByType('button').some(button => button.children.join('') === 'Corregir tipo')).toBe(false);
    renderer.unmount();
  });
});

// Lógica pura de la ficha editable de la OF (F3a). La base de datos vuelve a validar todo.

const redondear = n => Math.round((Number(n) || 0) * 100) / 100;

export const ESTADOS_EDITABLES = ['borrador', 'en_ingenieria'];
export const ESTADOS_NO_PLANIFICADO = ['aprobada', 'en_produccion'];

export const esEditable = estado => ESTADOS_EDITABLES.includes(estado);
export const admiteNoPlanificado = estado => ESTADOS_NO_PLANIFICADO.includes(estado);

export const ORIGENES_MATERIAL = [
  ['stock', 'Stock propio'],
  ['compra', 'Compra'],
  ['cliente', 'Material del cliente'],
];

// Número positivo con máximo 2 decimales (igual que of_max_dos_decimales en la BD).
function numeroValido(valor, { permiteCero = false } = {}) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!texto) return { vacio: true };
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return { error: 'Usa un número con máximo 2 decimales.' };
  const n = Number(texto);
  if (n < 0 || (!permiteCero && n === 0)) return { error: 'Debe ser mayor a 0.' };
  return { n };
}

export const TAREA_VACIA = {
  familia_trabajo_id: '', actividad_id: '', tarea_id: '', cargo_id: '', activo_id: '',
  horas_estimadas: '', horas_maquina: '', posicion: '',
};

export function tareaDesdeOperacion(op) {
  return {
    familia_trabajo_id: op.familia_trabajo_id || '',
    actividad_id: op.actividad_id || '',
    tarea_id: op.tarea_id || '',
    cargo_id: op.cargo_id || '',
    activo_id: op.activo_id || '',
    horas_estimadas: op.horas ? String(op.horas) : '',
    horas_maquina: op.horas_maquina ? String(op.horas_maquina) : '',
    posicion: String(op.secuencia || ''),
  };
}

export const CAMPOS_TAREA = ['familia_trabajo_id', 'actividad_id', 'tarea_id', 'cargo_id', 'horas_estimadas', 'horas_maquina', 'activo_id', 'posicion'];

export function validarTarea(form) {
  const errores = {};
  if (!form.familia_trabajo_id) errores.familia_trabajo_id = 'Elige el trabajo.';
  if (!form.actividad_id) errores.actividad_id = 'Elige la actividad.';
  if (!form.tarea_id) errores.tarea_id = 'Elige la tarea.';
  if (!form.cargo_id) errores.cargo_id = 'Elige el cargo.';
  const hh = numeroValido(form.horas_estimadas);
  if (hh.vacio) errores.horas_estimadas = 'Indica las horas-hombre.';
  else if (hh.error) errores.horas_estimadas = hh.error;
  const hm = numeroValido(form.horas_maquina, { permiteCero: true });
  if (hm.error) errores.horas_maquina = hm.error;
  if (!form.posicion) errores.posicion = 'Elige la posición.';
  return errores;
}

export function datosTarea(form) {
  return {
    familia_trabajo_id: form.familia_trabajo_id,
    actividad_id: form.actividad_id,
    tarea_id: form.tarea_id,
    cargo_id: form.cargo_id,
    activo_id: form.activo_id || null,
    horas_estimadas: String(form.horas_estimadas).trim().replace(',', '.'),
    horas_maquina: String(form.horas_maquina || '').trim().replace(',', '.') || '0',
    posicion: form.posicion,
  };
}

// Posiciones posibles en la ruta (la secuencia es única en toda la OF).
export function opcionesPosicion(operaciones = [], editandoId = null) {
  const resto = operaciones.filter(op => op.id !== editandoId);
  const opciones = resto.map((op, i) => ({ value: String(i + 1), label: `${i + 1} · antes de ${op.tarea}` }));
  const ultima = resto[resto.length - 1];
  opciones.push({ value: String(resto.length + 1), label: ultima ? `${resto.length + 1} · después de ${ultima.tarea}` : '1 · primera tarea' });
  return opciones;
}

// Vista previa del costo con las tarifas del catálogo (la BD guarda el valor definitivo).
export function costoTarea(form, catalogo) {
  const cargo = (catalogo?.cargos || []).find(c => c.id === form.cargo_id);
  const equipo = (catalogo?.equipos || []).find(e => e.id === form.activo_id);
  const hh = Number(String(form.horas_estimadas || '').replace(',', '.')) || 0;
  const hm = Number(String(form.horas_maquina || '').replace(',', '.')) || 0;
  return {
    costo: redondear(hh * (Number(cargo?.costo_hora) || 0) + hm * (Number(equipo?.costo_hora) || 0)),
    sinTarifa: Boolean(form.cargo_id) && !(Number(cargo?.costo_hora) > 0),
  };
}

export const MATERIAL_VACIO = { material_id: '', cantidad: '', origen: 'stock', operacion_id: '', motivo: '' };

export function materialDesdeLinea(m) {
  return { material_id: m.material_id || '', cantidad: m.cantidad ? String(m.cantidad) : '', origen: m.origen || 'stock', operacion_id: m.operacion_id || '', motivo: m.motivo || '' };
}

export const CAMPOS_MATERIAL = ['material_id', 'cantidad', 'origen', 'operacion_id', 'motivo'];

export function validarMaterial(form, { noPlanificado = false } = {}) {
  const errores = {};
  if (!form.material_id) errores.material_id = 'Elige un material del catálogo.';
  const c = numeroValido(form.cantidad);
  if (c.vacio) errores.cantidad = 'Indica la cantidad.';
  else if (c.error) errores.cantidad = c.error;
  if (!ORIGENES_MATERIAL.some(([k]) => k === form.origen)) errores.origen = 'Elige el origen.';
  if (noPlanificado && !String(form.motivo || '').trim()) errores.motivo = 'Indica por qué se necesita.';
  return errores;
}

export function datosMaterial(form) {
  return {
    material_id: form.material_id,
    cantidad: String(form.cantidad).trim().replace(',', '.'),
    origen: form.origen,
    operacion_id: form.operacion_id || null,
    motivo: String(form.motivo || '').trim() || null,
  };
}

export function primerError(errores, orden) {
  return orden.find(campo => errores[campo]) || null;
}

export function hayCambios(form, inicial) {
  return Object.keys(form).some(k => String(form[k] ?? '') !== String(inicial?.[k] ?? ''));
}

export function textoStock(material, cantidadNecesaria) {
  if (!material) return null;
  const disp = Number(material.disponible) || 0;
  const u = material.unidad || 'und';
  if (cantidadNecesaria != null && disp < cantidadNecesaria) return { tono: 'low', texto: `Stock: ${disp} de ${cantidadNecesaria} ${u}` };
  return { tono: 'ok', texto: `Stock: ${disp} ${u}` };
}

// Resumen para confirmar la aprobación.
export function resumenAprobacion(of, stockPorMaterial = new Map()) {
  const ops = of?.operaciones || [];
  const mats = (of?.materiales || []).filter(m => m.origen === 'stock');
  const horas = redondear(ops.reduce((s, o) => s + o.horas, 0));
  const horasMaquina = redondear(ops.reduce((s, o) => s + o.horas_maquina, 0));
  const cortos = mats.filter(m => (stockPorMaterial.get(m.material_id) ?? 0) < m.cantidad);
  return { operaciones: ops.length, horas, horasMaquina, materialesStock: mats.length, sinStockSuficiente: cortos.map(m => m.descripcion) };
}

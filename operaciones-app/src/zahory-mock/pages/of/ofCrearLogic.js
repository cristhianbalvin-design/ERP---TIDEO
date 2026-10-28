// Lógica pura de «Nueva OF»: agrupa la ruta por Trabajo › Actividad y calcula totales.

const redondear = n => Math.round((Number(n) || 0) * 100) / 100;

export function agruparRuta(operaciones = []) {
  const trabajos = [];
  const porTrabajo = new Map();
  for (const op of operaciones) {
    const tNombre = op.trabajo || 'Sin trabajo';
    if (!porTrabajo.has(tNombre)) {
      const t = { nombre: tNombre, actividades: [], horas: 0, horasMaquina: 0, tareas: 0, _act: new Map() };
      porTrabajo.set(tNombre, t);
      trabajos.push(t);
    }
    const t = porTrabajo.get(tNombre);
    const aNombre = op.actividad || 'Sin actividad';
    if (!t._act.has(aNombre)) {
      const a = { nombre: aNombre, operaciones: [] };
      t._act.set(aNombre, a);
      t.actividades.push(a);
    }
    t._act.get(aNombre).operaciones.push(op);
    t.horas += Number(op.horas) || 0;
    t.horasMaquina += Number(op.horas_maquina) || 0;
    t.tareas += 1;
  }
  return trabajos.map(({ _act, ...t }) => ({ ...t, horas: redondear(t.horas), horasMaquina: redondear(t.horasMaquina) }));
}

export function totalesVistaPrevia(vista, copiarHoja = true) {
  const ops = copiarHoja ? (vista?.operaciones || []) : [];
  const mats = copiarHoja ? (vista?.materiales || []) : [];
  const horas = redondear(ops.reduce((s, op) => s + (Number(op.horas) || 0), 0));
  const horasMaquina = redondear(ops.reduce((s, op) => s + (Number(op.horas_maquina) || 0), 0));
  const costoOps = redondear(ops.reduce((s, op) => s + (Number(op.costo) || 0), 0));
  const costoMats = redondear(mats.reduce((s, m) => s + (Number(m.subtotal) || 0), 0));
  return {
    operaciones: ops.length,
    materiales: mats.length,
    horas,
    horasMaquina,
    costoOps,
    costoMats,
    costo: redondear(costoOps + costoMats),
    sinBahia: ops.filter(op => !op.bahia).length,
  };
}

// Modo de creación según lo que ya tiene la OS.
export function modoCreacion(vista) {
  if (!vista) return 'sin_os';
  if (vista.of_existente) return 'adicional';
  if (!vista.hoja) return 'sin_hoja';
  if (!(vista.operaciones || []).length) return 'hoja_sin_fabricacion';
  return 'copiar';
}

export function textoHoras(horas, horasMaquina) {
  const h = `${Number(horas) || 0} h-hombre`;
  return horasMaquina ? `${h} · ${horasMaquina} h-máquina` : h;
}

export function filtrarOS(lista, texto) {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(texto.trim());
  if (!q) return lista;
  return lista.filter(os => [os.numero, os.cliente, os.nombre, os.hoja_numero].some(c => norm(c).includes(q)));
}

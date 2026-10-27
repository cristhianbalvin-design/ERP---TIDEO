import {
  agregarMaquina,
  actualizarMaquina,
  cambiarTipoMaquina,
  desactivarBahia,
  desactivarPuesto,
  guardarBahia,
  guardarPuesto,
} from '../../../services/plannerService.js';

export function crearAccionGuardarConfig({ sesion, ejecutar }) {
  async function guardarConfig(tipo, payload) {
    const comunes = { empresaId: sesion.empresaId, sociedadId: sesion.sociedadId };
    return ejecutar(async () => {
      if (tipo === 'bahia') await guardarBahia({ ...comunes, ...payload });
      if (tipo === 'puesto') await guardarPuesto({ ...comunes, ...payload });
      if (tipo === 'desactivarBahia') {
        await desactivarBahia({ empresaId: sesion.empresaId, id: payload });
      }
      if (tipo === 'desactivarPuesto') {
        await desactivarPuesto({ empresaId: sesion.empresaId, id: payload });
      }
      if (tipo === 'maquina' && payload.tipo) await agregarMaquina({ ...comunes, ...payload });
      else if (tipo === 'maquina') await guardarCambiosMaquina(sesion, payload);
    }, 'Configuración guardada.');
  }
  return guardarConfig;
}

async function guardarCambiosMaquina(sesion, payload) {
  if (payload.id && payload.tipo_clave) {
    await cambiarTipoMaquina({
      empresaId: sesion.empresaId,
      id: payload.id,
      tipoClave: payload.tipo_clave,
      nombre: payload.nombre,
    });
  }
  await actualizarMaquina({
    empresaId: sesion.empresaId,
    sociedadId: sesion.sociedadId,
    id: payload.id,
    bahiaId: payload.bahia_id,
    puestoId: payload.puesto_id,
    horasDia: payload.horas_dia || 8,
    estado: payload.estado || 'disponible',
    activoId: payload.activo_id,
  });
}

// Aplica en la base los cambios del borrador del Configurador, en orden: altas, cambios y bajas.
export function crearAccionGuardarTaller({ sesion, ejecutar, onGuardado }) {
  async function guardarTaller(diferencias) {
    const comunes = { empresaId: sesion.empresaId, sociedadId: sesion.sociedadId };
    const guardado = await ejecutar(async () => {
      const ids = new Map();
      const real = id => ids.get(id) || id;
      for (const bahia of diferencias.bahiasNuevas) {
        const creada = await guardarBahia({ ...comunes, codigo: bahia.codigo, nombre: bahia.nombre.trim(), categoria: bahia.categoria, orden: bahia.orden, activa: true });
        ids.set(bahia.id, creada.id);
      }
      for (const bahia of diferencias.bahiasEditadas) {
        await guardarBahia({ ...comunes, id: bahia.id, codigo: bahia.codigo, nombre: bahia.nombre.trim(), categoria: bahia.categoria, orden: bahia.orden, activa: true });
      }
      for (const puesto of diferencias.puestosNuevos) {
        const creado = await guardarPuesto({ ...comunes, bahia_id: real(puesto.bahia_id), codigo: puesto.codigo, nombre: puesto.nombre.trim(), capacidad: Number(puesto.capacidad) || 1, orden: puesto.orden, activo: true });
        ids.set(puesto.id, creado.id);
      }
      for (const puesto of diferencias.puestosEditados) {
        await guardarPuesto({ ...comunes, id: puesto.id, bahia_id: real(puesto.bahia_id), codigo: puesto.codigo, nombre: puesto.nombre.trim(), capacidad: Number(puesto.capacidad) || 1, orden: puesto.orden, activo: true });
      }
      for (const maquina of diferencias.maquinasNuevas) {
        await agregarMaquina({ ...comunes, tipo: { clave: maquina.tipo_clave, nombre: maquina.nombre }, bahiaId: real(maquina.bahia_id), puestoId: maquina.puesto_id ? real(maquina.puesto_id) : null, nombre: maquina.nombre, horasDia: Number(maquina.horas_dia) || 8, activoId: maquina.activo_id || null });
      }
      for (const maquina of diferencias.maquinasEditadas) {
        await cambiarTipoMaquina({ empresaId: sesion.empresaId, id: maquina.id, tipoClave: maquina.tipo_clave, nombre: maquina.nombre });
        await actualizarMaquina({ ...comunes, id: maquina.id, bahiaId: real(maquina.bahia_id), puestoId: maquina.puesto_id ? real(maquina.puesto_id) : null, horasDia: Number(maquina.horas_dia) || 8, estado: maquina.estado || 'disponible', activoId: maquina.activo_id || null });
      }
      for (const maquina of diferencias.maquinasQuitadas) {
        await actualizarMaquina({ ...comunes, id: maquina.id, bahiaId: maquina.bahia_id, puestoId: maquina.puesto_id, horasDia: Number(maquina.horas_dia) || 8, estado: 'baja', activoId: null });
      }
      for (const puesto of diferencias.puestosQuitados) await desactivarPuesto({ empresaId: sesion.empresaId, id: puesto.id });
      for (const bahia of diferencias.bahiasQuitadas) await desactivarBahia({ empresaId: sesion.empresaId, id: bahia.id });
    }, 'Configuración del taller guardada.');
    if (guardado) onGuardado?.();
    return guardado;
  }
  return guardarTaller;
}

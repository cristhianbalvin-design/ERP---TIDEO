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
  });
}

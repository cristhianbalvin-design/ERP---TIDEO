import { cargarAdjuntos, obtenerUrlAdjunto } from './storageService.js';

export const CATEGORIA_FIRMA_RUBRICA = 'firma_rubrica';

const ENTIDAD_TIPO_POR_PERSONAL_TIPO = {
  administrativo: 'personal_administrativo',
  operativo: 'personal_operativo',
  personal_administrativo: 'personal_administrativo',
  personal_operativo: 'personal_operativo',
};

export function entidadTipoDesdePersonalTipo(personalTipo) {
  return ENTIDAD_TIPO_POR_PERSONAL_TIPO[personalTipo] || null;
}

// Devuelve el adjunto de firma/rúbrica más reciente (con su URL de acceso) para un colaborador, o null si no tiene.
export async function obtenerFirmaVigente({ empresaId, personalId, personalTipo }) {
  const entidadTipo = entidadTipoDesdePersonalTipo(personalTipo);
  if (!empresaId || !personalId || !entidadTipo) return null;

  const adjuntos = await cargarAdjuntos({ empresaId, entidadTipo, entidadId: personalId });
  const firma = adjuntos.find(a => a.categoria === CATEGORIA_FIRMA_RUBRICA);
  if (!firma) return null;

  const url = await obtenerUrlAdjunto(firma);
  return { ...firma, url };
}

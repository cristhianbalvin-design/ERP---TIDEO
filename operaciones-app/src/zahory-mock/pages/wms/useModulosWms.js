import { useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { MODULOS_WMS_POR_DEFECTO, obtenerConfiguracionWms } from '../../../services/wmsMultipropositoService.js';

const cache = new Map();

// Módulos WMS activos de la empresa para mostrar u ocultar entradas del menú.
// Ante cualquier error se usan los valores por defecto (el menú nunca se rompe).
export function useModulosWms() {
  const { empresaId, estado } = useSesionOperativa();
  const [modulos, setModulos] = useState(() => cache.get(empresaId) || MODULOS_WMS_POR_DEFECTO);
  useEffect(() => {
    let vigente = true;
    if (!empresaId || estado !== 'listo') return () => { vigente = false; };
    if (cache.has(empresaId)) { setModulos(cache.get(empresaId)); return () => { vigente = false; }; }
    obtenerConfiguracionWms({ empresa_id: empresaId })
      .then(cfg => { cache.set(empresaId, cfg.modulos); if (vigente) setModulos(cfg.modulos); })
      .catch(() => { if (vigente) setModulos(MODULOS_WMS_POR_DEFECTO); });
    return () => { vigente = false; };
  }, [empresaId, estado]);
  return modulos;
}

export function invalidarModulosWms(empresaId) {
  cache.delete(empresaId);
}

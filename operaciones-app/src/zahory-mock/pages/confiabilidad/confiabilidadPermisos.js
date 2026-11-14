import { useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { usuarioPuedeFlota } from '../../../services/flotaService.js';

export function usePermisoPantalla(pantalla) {
  const sesion = useSesionOperativa();
  const clave = `${sesion.empresaId || ''}:${pantalla}`;
  const [resultado, setResultado] = useState({ cargando: true, ver: false, crear: false, editar: false, error: '' });
  useEffect(() => {
    let vigente = true;
    setResultado({ clave, cargando: true, ver: false, crear: false, editar: false, error: '' });
    if (!sesion.empresaId) {
      if (!sesion.cargando)
        setResultado({ clave, cargando: false, ver: false, crear: false, editar: false, error: '' });
      return () => {
        vigente = false;
      };
    }
    Promise.all(['ver', 'crear', 'editar'].map((accion) => usuarioPuedeFlota(sesion.empresaId, pantalla, accion)))
      .then(([ver, crear, editar]) => {
        if (vigente) setResultado({ clave, cargando: false, ver, crear, editar, error: '' });
      })
      .catch((error) => {
        if (vigente)
          setResultado({
            clave,
            cargando: false,
            ver: false,
            crear: false,
            editar: false,
            error: error.message || 'No se pudieron consultar los permisos.',
          });
      });
    return () => {
      vigente = false;
    };
  }, [sesion.empresaId, sesion.cargando, pantalla, clave]);
  if (resultado.clave !== clave) return { cargando: true, ver: false, crear: false, editar: false, error: '' };
  return {
    cargando: resultado.cargando,
    ver: resultado.ver,
    crear: resultado.crear && sesion.permiteEscritura !== false,
    editar: resultado.editar && sesion.permiteEscritura !== false,
    error: resultado.error,
  };
}

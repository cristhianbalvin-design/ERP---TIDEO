import { useCallback, useEffect, useState } from 'react';
import { consultarPermisosTransporte } from '../../../services/transporteRutasService.js';
import { decidirMotivoAccesoTransporte } from './transporteUtils.js';

export function usePermisosTransporte(sesion) {
  const empresaId = sesion.empresaId;
  const estado = sesion.estado;
  const [access, setAccess] = useState({
    loading: true,
    ver: null,
    crear: false,
    editar: false,
    error: '',
  });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;

    if (estado !== 'listo' || !empresaId) {
      setAccess({
        loading: false,
        ver: null,
        crear: false,
        editar: false,
        error: '',
      });
      return () => {
        vigente = false;
      };
    }

    setAccess({
      loading: true,
      ver: null,
      crear: false,
      editar: false,
      error: '',
    });

    consultarPermisosTransporte(empresaId)
      .then(permisos => {
        if (vigente) {
          setAccess({ loading: false, ...permisos, error: '' });
        }
      })
      .catch(error => {
        if (vigente) {
          setAccess({
            loading: false,
            ver: null,
            crear: false,
            editar: false,
            error: error?.message || String(error),
          });
        }
      });

    return () => {
      vigente = false;
    };
  }, [empresaId, estado, intento]);

  const reintentar = useCallback(() => {
    setIntento(value => value + 1);
  }, []);
  const motivo = decidirMotivoAccesoTransporte(estado, empresaId, access.error, access.ver);

  return { ...access, reintentar, motivo };
}

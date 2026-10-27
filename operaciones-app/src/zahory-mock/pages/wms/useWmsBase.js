import { useCallback, useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { getSupabaseClient } from '../../../lib/supabaseClient.js';
import { listarAlmacenesWms, MODULOS_WMS_POR_DEFECTO, obtenerConfiguracionWms } from '../../../services/wmsMultipropositoService.js';

export const mensajeError = error => error?.message || 'No se pudo completar la operación.';

const ACCIONES = ['ver', 'crear', 'editar', 'despachar'];

// Estado común de las pantallas WMS: sesión, permisos de inventario, configuración y almacenes.
export function useWmsBase() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const [permisos, setPermisos] = useState({ ver: false, crear: false, editar: false, despachar: false, cargados: false });
  const [config, setConfig] = useState({ modulos: { ...MODULOS_WMS_POR_DEFECTO }, umbral_aprobacion_ajuste: 500 });
  const [almacenes, setAlmacenes] = useState([]);
  const [errorBase, setErrorBase] = useState('');
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    let vigente = true;
    if (sesion.cargando || sesion.estado !== 'listo' || !empresaId) return () => { vigente = false; };
    setPermisos(actual => ({ ...actual, cargados: false }));
    setErrorBase('');
    Promise.all(ACCIONES.map(target_accion => getSupabaseClient().rpc('usuario_puede', {
      target_empresa_id: empresaId, target_pantalla: 'inventario', target_accion,
    }))).then(async resultados => {
      const fallo = resultados.find(item => item.error)?.error;
      if (fallo) throw fallo;
      const nuevos = Object.fromEntries(ACCIONES.map((accion, i) => [accion, Boolean(resultados[i].data)]));
      const [cfg, alms] = nuevos.ver ? await Promise.all([obtenerConfiguracionWms({ empresa_id: empresaId }), listarAlmacenesWms({ empresa_id: empresaId })]) : [null, []];
      if (!vigente) return;
      if (cfg) setConfig(cfg);
      setAlmacenes((alms || []).filter(a => (a.estado || 'activo') !== 'inactivo'));
      setPermisos({ ...nuevos, cargados: true });
    }).catch(e => { if (vigente) { setErrorBase(mensajeError(e)); setPermisos(actual => ({ ...actual, cargados: true })); } });
    return () => { vigente = false; };
  }, [empresaId, sesion.cargando, sesion.estado, reintento]);

  const recargarBase = useCallback(() => setReintento(valor => valor + 1), []);
  const escritura = Boolean(sesion.permiteEscritura);
  return {
    sesion, empresaId, permisos, config, almacenes, errorBase, recargarBase,
    sociedadId: sesion.sociedadId || null,
    puede: {
      crear: permisos.crear && escritura, editar: permisos.editar && escritura, despachar: permisos.despachar && escritura,
    },
  };
}

// Devuelve el contenido a mostrar mientras la base no está lista, o null si la pantalla puede pintarse.
export function estadoPrevio(base, { clase, nombre }) {
  const { sesion, empresaId, permisos, errorBase } = base;
  if (sesion.cargando || sesion.estado === 'cargando') return { tipo: 'vacio', texto: 'Cargando sesión operativa…', clase };
  if (!empresaId || ['sin_empresa', 'sin_sesion'].includes(sesion.estado)) return { tipo: 'vacio', texto: `Selecciona o solicita acceso a una empresa para ver ${nombre}.`, clase };
  if (!permisos.cargados) return { tipo: 'vacio', texto: 'Cargando permisos de inventario…', clase };
  if (errorBase && !permisos.ver) return { tipo: 'error', texto: errorBase, clase };
  if (!permisos.ver) return { tipo: 'vacio', texto: `No tienes permiso para ver ${nombre}.`, clase };
  return null;
}

// Helpers compartidos por Organigrama y por las pantallas de mantenimiento de Posiciones
// (Gestion de Posiciones, AsignacionCargosModal) para no recalcular la misma logica en cada lugar.

// Agrupa posiciones_usuarios activos (fecha_fin null) por posicion_id, con el usuario ya
// resuelto contra `usuariosPorId`. El llamador filtra `posicionesUsuarios` de antemano si
// necesita restringir a un subconjunto de posiciones (ej. Organigrama con filtro por empresa).
//
// Respaldo de visibilidad (ver esPosicionVisible en pages_admin.jsx): si NINGUNA posicion de una
// persona tiene el vinculo principal real (origen_asignacion_id -> principal=true), esa persona
// desaparecia del Organigrama sin ningun aviso (caso Camilo/Karyme, resuelto en 310 pero sin
// proteccion ante una recurrencia). Aqui se elige, solo para esos casos, una posicion de respaldo
// con el mismo criterio de desempate que consolidar_posiciones_duplicadas usa para elegir
// sobreviviente (309/310): mas historial en posiciones_usuarios, empate -> mas antigua, empate ->
// id menor. El front solo tiene cargadas las filas ACTIVAS de posiciones_usuarios (fecha_fin null,
// ver posicionesService.getPosicionesUsuarios), asi que "mas historial" se aproxima con el conteo
// de ocupantes activos de esa posicion en vez del historico completo -- en la practica casi
// siempre empata en 1 y el desempate real lo hace la antiguedad, que es el mismo resultado que
// tendria el criterio completo para el universo de posiciones de cargo individual/sin cargo.
// Esa posicion queda marcada con esPosicionRespaldo=true para que la UI la senale para revision.
export function buildOcupantesPorPosicion(posicionesUsuarios = [], usuariosPorId, posicionPorId = new Map()) {
  const activos = (posicionesUsuarios || []).filter(pu => !pu.fecha_fin);

  const historialPorPosicion = new Map();
  activos.forEach(pu => {
    historialPorPosicion.set(pu.posicion_id, (historialPorPosicion.get(pu.posicion_id) || 0) + 1);
  });

  const posicionesPorUsuario = new Map();
  activos.forEach(pu => {
    const persona = usuariosPorId.get(pu.user_id);
    if (!persona) return;
    const posicionInfo = (Array.isArray(persona.posiciones) ? persona.posiciones : [])
      .find(p => p.posicion_id === pu.posicion_id);
    const lista = posicionesPorUsuario.get(pu.user_id) || [];
    lista.push({ posicion_id: pu.posicion_id, esPosicionPrincipal: Boolean(posicionInfo?.principal) });
    posicionesPorUsuario.set(pu.user_id, lista);
  });

  const respaldoPorUsuario = new Map();
  posicionesPorUsuario.forEach((lista, userId) => {
    if (lista.some(x => x.esPosicionPrincipal)) return;
    const ordenada = [...lista].sort((a, b) => {
      const histA = historialPorPosicion.get(a.posicion_id) || 0;
      const histB = historialPorPosicion.get(b.posicion_id) || 0;
      if (histA !== histB) return histB - histA;
      const fechaA = posicionPorId.get(a.posicion_id)?.created_at || '';
      const fechaB = posicionPorId.get(b.posicion_id)?.created_at || '';
      if (fechaA !== fechaB) return fechaA < fechaB ? -1 : 1;
      return String(a.posicion_id) < String(b.posicion_id) ? -1 : 1;
    });
    respaldoPorUsuario.set(userId, ordenada[0]?.posicion_id || null);
  });

  const mapa = new Map();
  activos.forEach(pu => {
    const persona = usuariosPorId.get(pu.user_id);
    if (!persona) return;
    const posicionInfo = (Array.isArray(persona.posiciones) ? persona.posiciones : [])
      .find(p => p.posicion_id === pu.posicion_id);
    const esPosicionPrincipal = Boolean(posicionInfo?.principal);
    const esPosicionRespaldo = !esPosicionPrincipal && respaldoPorUsuario.get(pu.user_id) === pu.posicion_id;
    const lista = mapa.get(pu.posicion_id) || [];
    lista.push({ ...persona, esPosicionPrincipal, esPosicionRespaldo });
    mapa.set(pu.posicion_id, lista);
  });
  return mapa;
}

// Cuenta cuantas personas distintas estan hoy visibles solo por el criterio de respaldo (ninguna
// de sus posiciones tiene el vinculo principal real). Para un badge/contador simple en Gestion de
// Posiciones -- si el problema reaparece a futuro, se detecta con un vistazo.
export function contarRespaldoPrincipal(ocupantesPorPosicion) {
  const ids = new Set();
  ocupantesPorPosicion.forEach(ocupantes => {
    ocupantes.forEach(o => { if (o.esPosicionRespaldo) ids.add(o.id); });
  });
  return ids.size;
}

export function getPosicionesSinCargo(posiciones = []) {
  return posiciones.filter(p => !p.cargo_id);
}

// Filtra posiciones cuya unidad organizacional tenga la categoria dada (mismo enum que
// ROLE_CATEGORIES en hierarchy.js: admin, comercial, operaciones, finanzas, rrhh, compras,
// logistica, customer_success, otro -- ver unidades_organizacionales.categoria, 302). Usado por
// el selector de "Responsable de compras" de Proveedores para listar solo posiciones de la(s)
// unidad(es) de Compras del tenant, sin asumir un nombre de unidad fijo (texto libre por tenant).
export function getPosicionesPorCategoriaUnidad(posiciones = [], unidadesOrganizacionales = [], categoria) {
  const unidadIds = new Set(
    unidadesOrganizacionales.filter(u => u.categoria === categoria).map(u => u.id)
  );
  return posiciones.filter(p => unidadIds.has(p.unidad_organizacional_id));
}

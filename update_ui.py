import os

path = 'src/pages_admin.jsx'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# Update Organigrama useApp
code = code.replace(
    'crearPosicion, reasignarCargoDePosicion, addNotificacion, authUser,',
    'crearPosicion, archivarPosicion, eliminarPosicion, reasignarCargoDePosicion, addNotificacion, authUser,'
)

# Update GestionPosicionesTab invocation in Organigrama
old_invocation = '''<GestionPosicionesTab
          posiciones={posicionesDeEmpresa}
          posicionesUsuarios={posicionesUsuarios}
          ocupantesPorPosicion={ocupantesPorPosicion}
          unidadNombrePorId={unidadNombrePorId}
          posicionPorId={posicionPorId}
          unidadesOrganizacionales={unidadesOrganizacionales}
          cargos={cargos}
          usuarios={usersDeEmpresa}
          reasignarUnidadDePosicion={reasignarUnidadDePosicion}
          reasignarCargoDePosicion={reasignarCargoDePosicion}
          crearPosicion={crearPosicion}
          addNotificacion={addNotificacion}
        />'''
new_invocation = '''<GestionPosicionesTab
          posiciones={posicionesDeEmpresa}
          posicionesUsuarios={posicionesUsuarios}
          ocupantesPorPosicion={ocupantesPorPosicion}
          unidadNombrePorId={unidadNombrePorId}
          posicionPorId={posicionPorId}
          unidadesOrganizacionales={unidadesOrganizacionales}
          cargos={cargos}
          usuarios={usersDeEmpresa}
          reasignarUnidadDePosicion={reasignarUnidadDePosicion}
          reasignarCargoDePosicion={reasignarCargoDePosicion}
          crearPosicion={crearPosicion}
          archivarPosicion={archivarPosicion}
          eliminarPosicion={eliminarPosicion}
          addNotificacion={addNotificacion}
        />'''
code = code.replace(old_invocation, new_invocation)

# Rewrite GestionPosicionesTab
start_idx = code.find('function GestionPosicionesTab({')
end_idx = code.find('// ============ CONFIGURACIÓN Y MAESTROS ============', start_idx)

new_gestion_tab = '''function GestionPosicionesTab({
  posiciones = [], posicionesUsuarios = [], ocupantesPorPosicion, unidadNombrePorId, posicionPorId,
  unidadesOrganizacionales = [], cargos = [], usuarios = [],
  reasignarUnidadDePosicion, reasignarCargoDePosicion, crearPosicion, archivarPosicion, eliminarPosicion, addNotificacion,
}) {
  const [filtroUnidad, setFiltroUnidad] = React.useState('');
  const [filtroCargo, setFiltroCargo] = React.useState('');
  const [filtroEstado, setFiltroEstado] = React.useState('');
  const [showCrearVacante, setShowCrearVacante] = React.useState(false);
  const [reasignandoUnidadId, setReasignandoUnidadId] = React.useState(null);
  const [nuevaUnidadInline, setNuevaUnidadInline] = React.useState('');
  const [guardandoUnidadInline, setGuardandoUnidadInline] = React.useState(false);
  const [editandoCargoId, setEditandoCargoId] = React.useState(null);
  const [nuevoCargoInline, setNuevoCargoInline] = React.useState('');
  const [guardandoCargoInline, setGuardandoCargoInline] = React.useState(false);

  const cargoNombrePorId = React.useMemo(() => new Map(cargos.map(c => [c.id, c.nombre])), [cargos]);

  const posicionesFiltradas = React.useMemo(() => posiciones.filter(p => {
    if (filtroUnidad && p.unidad_organizacional_id !== filtroUnidad) return false;
    if (filtroCargo === '__sin_cargo__' && p.cargo_id) return false;
    if (filtroCargo && filtroCargo !== '__sin_cargo__' && p.cargo_id !== filtroCargo) return false;
    if (filtroEstado === 'vacante' && p.estado !== 'vacante') return false;
    if (filtroEstado === 'ocupada' && p.estado === 'vacante') return false;
    return true;
  }), [posiciones, filtroUnidad, filtroCargo, filtroEstado]);

  const metrics = React.useMemo(() => {
    const total = posicionesFiltradas.length;
    let cubiertas = 0;
    let vacantes = 0;
    for (const p of posicionesFiltradas) {
      if (p.estado === 'vacante') vacantes++;
      else cubiertas++;
    }
    const ocupacion = total ? Math.round((cubiertas / total) * 100) : 0;
    return { total, cubiertas, vacantes, ocupacion };
  }, [posicionesFiltradas]);

  // Agrupacion por unidad para las tarjetas y la tabla
  const gruposPorUnidad = React.useMemo(() => {
    const map = new Map(); // unidadId -> { posiciones: [], cubiertas: 0, vacantes: 0 }
    posicionesFiltradas.forEach(p => {
      const uid = p.unidad_organizacional_id || '__sin_unidad__';
      if (!map.has(uid)) {
        map.set(uid, {
          unidadId: uid,
          nombre: uid === '__sin_unidad__' ? 'Sin unidad' : (unidadNombrePorId.get(uid) || 'Sin unidad'),
          posiciones: [],
          cubiertas: 0,
          vacantes: 0,
        });
      }
      const g = map.get(uid);
      g.posiciones.push(p);
      if (p.estado === 'vacante') g.vacantes++;
      else g.cubiertas++;
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [posicionesFiltradas, unidadNombrePorId]);

  const labelReportaA = (posicion) => {
    if (!posicion.reporta_a_posicion_id) return <span className="text-subtle">Sin jefe (nivel superior)</span>;
    const jefe = posicionPorId.get(posicion.reporta_a_posicion_id);
    if (!jefe) return <span className="text-subtle">—</span>;
    const ocupantesJefe = ocupantesPorPosicion.get(jefe.id) || [];
    return ocupantesJefe.length
      ? ocupantesJefe.map(o => o.nombre).join(' + ')
      : <span className="text-subtle" style={{ fontStyle: 'italic' }}>Posición vacante</span>;
  };

  const estadoBadge = (estado) => {
    if (estado === 'vacante') return <span className="badge badge-gray">Vacante</span>;
    if (estado === 'parcial') return <span className="badge badge-orange">Parcial</span>;
    return <span className="badge badge-green">Cubierta</span>;
  };

  const iniciarReasignarUnidad = (posicion) => {
    setReasignandoUnidadId(posicion.id);
    setNuevaUnidadInline(posicion.unidad_organizacional_id || '');
  };
  const cancelarReasignarUnidad = () => { setReasignandoUnidadId(null); setNuevaUnidadInline(''); };
  const guardarReasignarUnidad = async (posicion) => {
    if (!nuevaUnidadInline || nuevaUnidadInline === posicion.unidad_organizacional_id) { cancelarReasignarUnidad(); return; }
    setGuardandoUnidadInline(true);
    try {
      await reasignarUnidadDePosicion(posicion.id, nuevaUnidadInline);
      addNotificacion('Unidad organizacional actualizada.');
    } catch {
      addNotificacion('No se pudo actualizar la unidad organizacional.');
    }
    setGuardandoUnidadInline(false);
    cancelarReasignarUnidad();
  };

  const iniciarEditarCargo = (posicion) => {
    setEditandoCargoId(posicion.id);
    setNuevoCargoInline(posicion.cargo_id || '');
  };
  const cancelarEditarCargo = () => { setEditandoCargoId(null); setNuevoCargoInline(''); };
  const guardarEditarCargo = async (posicion) => {
    if (nuevoCargoInline === (posicion.cargo_id || '')) { cancelarEditarCargo(); return; }
    setGuardandoCargoInline(true);
    try {
      await reasignarCargoDePosicion(posicion.id, nuevoCargoInline || null);
      addNotificacion('Cargo de la posición actualizado.');
    } catch {
      addNotificacion('No se pudo actualizar el cargo de la posición.');
    }
    setGuardandoCargoInline(false);
    cancelarEditarCargo();
  };

  const confirmarEliminar = async (posicionId) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta posición vacante? Esta acción no se puede deshacer.')) {
      try {
        await eliminarPosicion(posicionId);
        addNotificacion('Posición eliminada correctamente.');
      } catch (err) {
        addNotificacion('Error al eliminar la posición.');
      }
    }
  };

  const confirmarArchivar = async (posicionId) => {
    if (window.confirm('Esta posición tuvo ocupantes en el pasado. Será archivada para mantener el historial, pero ya no aparecerá como disponible. ¿Deseas continuar?')) {
      try {
        await archivarPosicion(posicionId);
        addNotificacion('Posición archivada correctamente.');
      } catch (err) {
        addNotificacion('Error al archivar la posición.');
      }
    }
  };

  return (
    <>
      <div className="kpi-grid mb-6">
        <div className="kpi-card">
          <div className="kpi-label">Headcount Total</div>
          <div className="kpi-value">{metrics.total}</div>
          <div className="kpi-icon cyan">{I.users}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cubiertas</div>
          <div className="kpi-value">{metrics.cubiertas}</div>
          <div className="kpi-icon green">{I.check}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vacantes</div>
          <div className="kpi-value">{metrics.vacantes}</div>
          <div className="kpi-icon orange">{I.alertCircle}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">% Ocupación</div>
          <div className="kpi-value">{metrics.ocupacion}%</div>
          <div className="kpi-icon purple">{I.activity}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        {gruposPorUnidad.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
            {gruposPorUnidad.map(g => {
              const progreso = g.posiciones.length ? (g.cubiertas / g.posiciones.length) * 100 : 0;
              const isActive = filtroUnidad === g.unidadId || (!filtroUnidad && g.unidadId === '__sin_unidad__');
              return (
                <div 
                  key={g.unidadId} 
                  className="kpi-card" 
                  style={{ cursor: 'pointer', outline: isActive && filtroUnidad ? '2px solid var(--cyan)' : 'none', padding: '12px 16px', minHeight: 0 }}
                  onClick={() => setFiltroUnidad(filtroUnidad === g.unidadId ? '' : g.unidadId)}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={g.nombre}>
                    {g.nombre}
                  </div>
                  <div style={{ width: '100%', height: 4, backgroundColor: 'var(--bg-hover)', borderRadius: 2, marginBottom: 8 }}>
                    <div style={{ width: progreso + '%', height: '100%', backgroundColor: 'var(--cyan)', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                    {g.cubiertas} cubiertas · {g.vacantes} vacantes
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select className="input" style={{ flex: '1 1 200px' }} value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)}>
            <option value="">Todas las unidades</option>
            {unidadesOrganizacionales.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select className="input" style={{ flex: '1 1 200px' }} value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}>
            <option value="">Todos los cargos</option>
            <option value="__sin_cargo__">Sin cargo</option>
            {cargos.filter(c => c.estado === 'activo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="input" style={{ flex: '1 1 160px' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="vacante">Vacante</option>
            <option value="ocupada">Ocupada</option>
          </select>
          <button className="btn btn-secondary" onClick={() => setShowCrearVacante(true)}>{I.plus} Crear posición vacante</button>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cargo</th><th>Estado</th><th>Ocupante(s)</th><th>Reporta a</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
            <tbody>
              {gruposPorUnidad.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 24 }}>Sin posiciones que coincidan con los filtros.</td></tr>
              )}
              {gruposPorUnidad.map(g => (
                <React.Fragment key={g.unidadId}>
                  <tr style={{ backgroundColor: 'var(--bg-hover)' }}>
                    <td colSpan={5} style={{ fontWeight: 600, fontSize: 13, paddingTop: 12, paddingBottom: 12 }}>
                      {g.nombre} <span style={{ fontWeight: 400, color: 'var(--fg-muted)', marginLeft: 8 }}>({g.cubiertas} cubiertas · {g.vacantes} vacantes)</span>
                    </td>
                  </tr>
                  {g.posiciones.map(p => {
                    const ocupantes = ocupantesPorPosicion.get(p.id) || [];
                    const isOcupada = p.estado === 'cubierta' || p.estado === 'parcial';
                    const isVacante = p.estado === 'vacante';
                    const hasHistorial = posicionesUsuarios.some(pu => pu.posicion_id === p.id);

                    return (
                      <tr key={p.id}>
                        <td className="text-muted" style={{ fontSize: 12 }}>{cargoNombrePorId.get(p.cargo_id) || <span className="text-subtle">Sin cargo</span>}</td>
                        <td>{estadoBadge(p.estado)}</td>
                        <td style={{ fontSize: 12, fontStyle: ocupantes.length ? 'normal' : 'italic' }}>
                          {ocupantes.length ? ocupantes.map(o => o.nombre).join(' + ') : <span className="text-subtle">Vacante</span>}
                        </td>
                        <td style={{ fontSize: 12 }}>{labelReportaA(p)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {reasignandoUnidadId === p.id ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <select className="select" style={{ fontSize: 11 }} value={nuevaUnidadInline} onChange={e => setNuevaUnidadInline(e.target.value)}>
                                {unidadesOrganizacionales.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                              </select>
                              <button className="btn btn-sm btn-primary" disabled={guardandoUnidadInline} onClick={() => guardarReasignarUnidad(p)}>Guardar</button>
                              <button className="btn btn-sm btn-ghost" onClick={cancelarReasignarUnidad}>Cancelar</button>
                            </div>
                          ) : editandoCargoId === p.id ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <select className="select" style={{ fontSize: 11 }} value={nuevoCargoInline} onChange={e => setNuevoCargoInline(e.target.value)}>
                                <option value="">Sin cargo</option>
                                {cargos.filter(c => c.estado === 'activo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                              </select>
                              <button className="btn btn-sm btn-primary" disabled={guardandoCargoInline} onClick={() => guardarEditarCargo(p)}>Guardar</button>
                              <button className="btn btn-sm btn-ghost" onClick={cancelarEditarCargo}>Cancelar</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-ghost" onClick={() => iniciarReasignarUnidad(p)}>Reasignar unidad</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => iniciarEditarCargo(p)}>Editar cargo</button>
                              {isVacante && !hasHistorial && (
                                <button className="icon-btn text-red" title="Eliminar posición vacante" onClick={() => confirmarEliminar(p.id)}>{I.trash}</button>
                              )}
                              {isVacante && hasHistorial && (
                                <button className="icon-btn" title="Archivar posición (preservar historial)" onClick={() => confirmarArchivar(p.id)}>{I.archive}</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCrearVacante && (
        <div className="modal-backdrop" onClick={() => setShowCrearVacante(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3>Crear posición vacante</h3>
              <button className="icon-btn" onClick={() => setShowCrearVacante(false)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12 }}>
                Usa "+ Crear nueva posición" para reservar una plaza sin asignarla a nadie todavía. También puedes elegir una posición vacante existente del listado si corresponde.
              </p>
              <PosicionSelector
                label="Posición"
                value=""
                onChange={(id) => { if (id) { setShowCrearVacante(false); addNotificacion('Posición vacante lista.'); } }}
                posiciones={posiciones}
                posicionesUsuarios={posicionesUsuarios}
                unidadesOrganizacionales={unidadesOrganizacionales}
                cargos={cargos}
                usuarios={usuarios}
                onCrearPosicion={crearPosicion}
                allowCrear
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
'''

code = code[:start_idx] + new_gestion_tab + code[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/pages_admin.jsx')

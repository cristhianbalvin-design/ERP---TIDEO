import React, { useMemo, useState } from 'react';

const buildPosicionLabel = (posicion, { unidadNombrePorId, cargoNombrePorId, ocupantesPorPosicion, usuarios }) => {
  const unidad = unidadNombrePorId.get(posicion.unidad_organizacional_id) || 'Sin unidad';
  const cargo = cargoNombrePorId.get(posicion.cargo_id) || 'Sin cargo';
  const ocupantesIds = ocupantesPorPosicion.get(posicion.id) || [];
  const ocupanteLabel = ocupantesIds.length
    ? `ocupada por ${ocupantesIds.map(id => usuarios.find(u => u.id === id)?.nombre || 'usuario').join(', ')}`
    : 'vacante';
  return `${unidad} · ${cargo} — ${ocupanteLabel}`;
};

// Selector reutilizable de Posicion organizacional: reemplaza los viejos selects de "Jefe
// directo" en alta/edicion de usuario y en el Organigrama. Muestra vacante/ocupada por X, y
// permite crear una posicion nueva en el mismo flujo cuando no existe una adecuada todavia.
export function PosicionSelector({
  label = 'Posicion',
  value,
  onChange,
  posiciones = [],
  posicionesUsuarios = [],
  unidadesOrganizacionales = [],
  cargos = [],
  usuarios = [],
  onCrearPosicion,
  allowCrear = true,
  currentUserId = null,
}) {
  const [creando, setCreando] = useState(false);
  const [nuevaPosicion, setNuevaPosicionState] = useState({ unidad_organizacional_id: '', cargo_id: '', reporta_a_posicion_id: '' });
  const [guardando, setGuardando] = useState(false);
  // No nulo cuando, en modo 'individual', ya existe(n) posicion(es) vacante(s) con la misma
  // unidad+cargo+jefe: se le pide al humano decidir (reutilizar o crear igual), nunca se decide
  // solo -- ver handleCrearPosicion.
  const [vacantesCoincidentes, setVacantesCoincidentes] = useState(null);
  const setNuevaPosicion = (updater) => {
    setVacantesCoincidentes(null);
    setNuevaPosicionState(updater);
  };

  const unidadNombrePorId = useMemo(() => new Map(unidadesOrganizacionales.map(u => [u.id, u.nombre])), [unidadesOrganizacionales]);
  const cargoNombrePorId = useMemo(() => new Map(cargos.map(c => [c.id, c.nombre])), [cargos]);
  const cargoModoGestionPorId = useMemo(() => new Map(cargos.map(c => [c.id, c.modo_gestion])), [cargos]);
  const usuariosActivosPorId = useMemo(
    () => new Map(usuarios
      .filter(u => String(u.estado || 'Activo').trim().toLowerCase() === 'activo')
      .map(u => [u.id, u])),
    [usuarios]
  );
  const ocupantesPorPosicion = useMemo(() => {
    const map = new Map();
    posicionesUsuarios.filter(pu => !pu.fecha_fin && usuariosActivosPorId.has(pu.user_id)).forEach(pu => {
      const lista = map.get(pu.posicion_id) || [];
      lista.push(pu.user_id);
      map.set(pu.posicion_id, lista);
    });
    return map;
  }, [posicionesUsuarios, usuariosActivosPorId]);

  // Una posicion de cargo individual (o sin cargo -- el default es individual) ya ocupada por
  // OTRA persona no puede seleccionarse: los cargos individuales no admiten doble ocupacion. La
  // propia posicion actual del usuario que se esta editando sigue seleccionable con normalidad.
  const posicionBloqueada = (posicion) => {
    const modoGestion = cargoModoGestionPorId.get(posicion.cargo_id) || 'individual';
    if (modoGestion === 'compartido') return false;
    const ocupantes = ocupantesPorPosicion.get(posicion.id) || [];
    return ocupantes.some(id => id !== currentUserId);
  };

  const opciones = useMemo(() => posiciones
    .map(p => ({ posicion: p, label: buildPosicionLabel(p, { unidadNombrePorId, cargoNombrePorId, ocupantesPorPosicion, usuarios }) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es')),
  [posiciones, unidadNombrePorId, cargoNombrePorId, ocupantesPorPosicion, usuarios]);

  const handleSelect = (posicionId) => {
    onChange(posicionId || '');
  };

  // Posiciones existentes con exactamente la misma unidad + cargo + jefe que lo que se esta por
  // crear (mismo "puesto" en el sentido organizacional).
  const buscarCoincidentes = () => posiciones.filter(p =>
    p.unidad_organizacional_id === nuevaPosicion.unidad_organizacional_id
    && (p.cargo_id || null) === (nuevaPosicion.cargo_id || null)
    && (p.reporta_a_posicion_id || null) === (nuevaPosicion.reporta_a_posicion_id || null)
  );

  const crearPosicionDeVerdad = async () => {
    setGuardando(true);
    try {
      const creada = await onCrearPosicion({
        unidad_organizacional_id: nuevaPosicion.unidad_organizacional_id,
        cargo_id: nuevaPosicion.cargo_id || null,
        reporta_a_posicion_id: nuevaPosicion.reporta_a_posicion_id || null,
      });
      onChange(creada.id);
      setCreando(false);
      setVacantesCoincidentes(null);
      setNuevaPosicion({ unidad_organizacional_id: '', cargo_id: '', reporta_a_posicion_id: '' });
    } catch (err) {
      window.alert('No se pudo crear la posicion: ' + (err.message || 'Error desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const handleCrearPosicion = async () => {
    if (!nuevaPosicion.unidad_organizacional_id) {
      window.alert('Selecciona una unidad organizacional para la nueva posicion.');
      return;
    }

    const cargoSeleccionado = cargos.find(c => c.id === nuevaPosicion.cargo_id);
    const coincidentes = buscarCoincidentes();

    // Cargo marcado como 'compartido' (Maestros -> Cargos): varias personas ocupan la MISMA
    // posicion, nunca se duplica -- se reutiliza directo, sin preguntar (la decision ya la tomo
    // Cristhian al marcar el cargo).
    if (cargoSeleccionado?.modo_gestion === 'compartido' && coincidentes.length > 0) {
      onChange(coincidentes[0].id);
      setCreando(false);
      setVacantesCoincidentes(null);
      setNuevaPosicion({ unidad_organizacional_id: '', cargo_id: '', reporta_a_posicion_id: '' });
      return;
    }

    // Cargo individual (o sin cargo aun): si hay posiciones VACANTES con la misma configuracion,
    // no se decide solo -- podria ser una ampliacion real de headcount. Se le pregunta al humano.
    const vacantes = coincidentes.filter(p => p.estado === 'vacante');
    if (vacantes.length > 0) {
      setVacantesCoincidentes(vacantes);
      return;
    }

    await crearPosicionDeVerdad();
  };

  return (
    <div className="input-group">
      <label>{label}</label>
      <select className="input" value={value || ''} onChange={e => handleSelect(e.target.value)}>
        <option value="">Sin posicion asignada</option>
        {opciones.map(({ posicion, label: optLabel }) => (
          <option key={posicion.id} value={posicion.id} disabled={posicionBloqueada(posicion)}>{optLabel}</option>
        ))}
      </select>
      {allowCrear && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => { setCreando(v => !v); setVacantesCoincidentes(null); }}>
          {creando ? 'Cancelar nueva posicion' : '+ Crear nueva posicion'}
        </button>
      )}
      {creando && (
        <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8, display: 'grid', gap: 8 }}>
          <div className="input-group">
            <label>Unidad organizacional</label>
            <select className="input" value={nuevaPosicion.unidad_organizacional_id} onChange={e => setNuevaPosicion(p => ({ ...p, unidad_organizacional_id: e.target.value }))}>
              <option value="">Selecciona una unidad</option>
              {unidadesOrganizacionales.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>Cargo</label>
            <select className="input" value={nuevaPosicion.cargo_id} onChange={e => setNuevaPosicion(p => ({ ...p, cargo_id: e.target.value }))}>
              <option value="">Sin cargo</option>
              {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>Reporta a</label>
            <select className="input" value={nuevaPosicion.reporta_a_posicion_id} onChange={e => setNuevaPosicion(p => ({ ...p, reporta_a_posicion_id: e.target.value }))}>
              <option value="">Sin jefe (nivel superior)</option>
              {opciones.map(({ posicion, label: optLabel }) => (
                <option key={posicion.id} value={posicion.id}>{optLabel}</option>
              ))}
            </select>
          </div>
          {vacantesCoincidentes ? (
            <div style={{ padding: 8, border: '1px dashed var(--border)', borderRadius: 6, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12 }}>
                Hay {vacantesCoincidentes.length} posicion(es) vacante(s) con esta misma unidad + cargo + jefe. ¿Deseas asignar a esa posicion existente, o crear una posicion nueva de todos modos (ampliacion de headcount)?
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button" className="btn btn-secondary"
                  onClick={() => {
                    onChange(vacantesCoincidentes[0].id);
                    setCreando(false);
                    setVacantesCoincidentes(null);
                    setNuevaPosicion({ unidad_organizacional_id: '', cargo_id: '', reporta_a_posicion_id: '' });
                  }}
                >
                  Usar posicion existente
                </button>
                <button type="button" className="btn btn-primary" disabled={guardando} onClick={crearPosicionDeVerdad}>
                  {guardando ? 'Creando...' : 'Crear posicion nueva de todos modos'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" disabled={guardando} onClick={handleCrearPosicion}>
              {guardando ? 'Creando...' : 'Crear y asignar'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

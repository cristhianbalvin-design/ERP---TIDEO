import React, { useMemo, useState } from 'react';
import { I } from '../icons.jsx';
import { getPosicionesSinCargo } from '../lib/posicionesHelpers.js';

// Modal de asignacion masiva de Cargo a Posiciones sin cargo asignado. Extraido de Organigrama
// para reutilizarlo tambien desde Gestion de Posiciones (Maestros) sin duplicar la logica.
// No lee/escribe personal_operativo.cargo_id ni personal_administrativo.cargo_id salvo para leer
// la sugerencia legada de la persona que ocupa cada posicion.
export function AsignacionCargosModal({
  posiciones = [],
  ocupantesPorPosicion,
  unidadNombrePorId,
  cargos = [],
  personalAdmin = [],
  personalOperativo = [],
  reasignarCargoDePosicion,
  addNotificacion,
  onClose,
}) {
  const [seleccionCargosPos, setSeleccionCargosPos] = useState({});
  const [confirmadasCargosPos, setConfirmadasCargosPos] = useState(() => new Set());
  const [guardandoLoteCargos, setGuardandoLoteCargos] = useState(false);

  const posicionesSinCargo = useMemo(() => getPosicionesSinCargo(posiciones), [posiciones]);
  const legacyCargoPorAuthUser = useMemo(() => {
    const map = new Map();
    [...personalOperativo, ...personalAdmin].forEach(p => {
      if (p.auth_user_id && p.cargo_id) map.set(p.auth_user_id, p.cargo_id);
    });
    return map;
  }, [personalOperativo, personalAdmin]);
  const sugerenciaCargoPorPosicion = useMemo(() => {
    const map = new Map();
    posicionesSinCargo.forEach(p => {
      const ocupantes = ocupantesPorPosicion.get(p.id) || [];
      const principal = ocupantes.find(o => o.esPosicionPrincipal) || ocupantes[0];
      const sugerido = principal ? legacyCargoPorAuthUser.get(principal.id) : null;
      if (sugerido) map.set(p.id, sugerido);
    });
    return map;
  }, [posicionesSinCargo, ocupantesPorPosicion, legacyCargoPorAuthUser]);

  const cambiarSeleccionCargoPos = (posId, cargoId) => {
    setSeleccionCargosPos(prev => ({ ...prev, [posId]: cargoId }));
    if (!cargoId) setConfirmadasCargosPos(prev => { const n = new Set(prev); n.delete(posId); return n; });
  };
  const toggleConfirmarCargoPos = (posId, checked) => {
    setConfirmadasCargosPos(prev => { const n = new Set(prev); if (checked) n.add(posId); else n.delete(posId); return n; });
  };
  const handleGuardarLoteCargos = async () => {
    const pendientes = [...confirmadasCargosPos].filter(posId => seleccionCargosPos[posId] ?? sugerenciaCargoPorPosicion.get(posId));
    if (!pendientes.length) return;
    setGuardandoLoteCargos(true);
    try {
      await Promise.all(pendientes.map(posId => {
        const cargoId = seleccionCargosPos[posId] ?? sugerenciaCargoPorPosicion.get(posId);
        return reasignarCargoDePosicion(posId, cargoId);
      }));
      setConfirmadasCargosPos(prev => { const n = new Set(prev); pendientes.forEach(id => n.delete(id)); return n; });
      addNotificacion(`${pendientes.length} posición(es) actualizadas con su cargo.`);
    } catch (err) {
      addNotificacion('Error al guardar algunas asignaciones: ' + (err?.message || 'error desconocido'));
    } finally {
      setGuardandoLoteCargos(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <h3>Asignar cargo a posiciones ({posicionesSinCargo.length} pendientes)</h3>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {posicionesSinCargo.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>
              Todas las posiciones tienen cargo asignado.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12 }}>
                Algunas filas ya vienen con un cargo sugerido (marcado <strong>"(sugerido)"</strong>), tomado de la ficha legada de la persona que ocupa la posición. Las que muestran <strong>"Sin cargo"</strong> tienen su casilla desactivada hasta que elijas un cargo manualmente en su desplegable — así nunca se confirma una fila sin que alguien haya elegido explícitamente qué cargo asignarle. No se guarda nada hasta que marques la casilla de cada fila que quieras aplicar y presiones "Guardar".
              </div>
              <table className="tbl">
                <thead><tr><th style={{ width: 32 }}></th><th>Unidad organizacional</th><th>Ocupante</th><th>Cargo a asignar</th></tr></thead>
                <tbody>
                  {posicionesSinCargo.map(p => {
                    const ocupantes = ocupantesPorPosicion.get(p.id) || [];
                    const ocupanteLabel = ocupantes.length ? ocupantes.map(o => o.nombre).join(' + ') : 'Vacante';
                    const sugerido = sugerenciaCargoPorPosicion.get(p.id) || '';
                    const seleccion = seleccionCargosPos[p.id] ?? sugerido;
                    const confirmado = confirmadasCargosPos.has(p.id);
                    return (
                      <tr key={p.id} style={{ opacity: seleccion ? 1 : 0.6 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={confirmado}
                            disabled={!seleccion}
                            title={!seleccion ? 'Elige un cargo en esta fila para poder confirmarla' : ''}
                            onChange={e => toggleConfirmarCargoPos(p.id, e.target.checked)}
                          />
                        </td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{unidadNombrePorId.get(p.unidad_organizacional_id) || 'Sin unidad'}</td>
                        <td className="text-muted" style={{ fontSize: 12, fontStyle: ocupantes.length ? 'normal' : 'italic' }}>{ocupanteLabel}</td>
                        <td>
                          <select className="select" value={seleccion} onChange={e => cambiarSeleccionCargoPos(p.id, e.target.value)}>
                            <option value="">Sin cargo</option>
                            {cargos.filter(c => c.estado === 'activo').map(c => (
                              <option key={c.id} value={c.id}>{c.nombre}{sugerido === c.id ? ' (sugerido)' : ''}</option>
                            ))}
                          </select>
                          {!seleccion && (
                            <div style={{ fontSize: 10, color: 'var(--orange, #d97706)', marginTop: 2 }}>
                              Elige un cargo para poder confirmar esta fila
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{confirmadasCargosPos.size} confirmada(s) de {posicionesSinCargo.length}</span>
          <button className="btn btn-primary" disabled={confirmadasCargosPos.size === 0 || guardandoLoteCargos} onClick={handleGuardarLoteCargos}>
            {guardandoLoteCargos ? 'Guardando...' : `Guardar ${confirmadasCargosPos.size} asignación(es)`}
          </button>
        </div>
      </div>
    </div>
  );
}

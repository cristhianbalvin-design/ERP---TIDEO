import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons.jsx';
import {
  adaptarAlcanceCuentasCajaChica,
  extraerCodigoErrorCierre,
  filtrarCuentasDevolucion,
  filtrarDestinosTransferencia,
  MENSAJE_CIERRE_EXITO_REFRESH_FALLIDO,
  MENSAJE_CIERRE_MODO_DEMO,
  mensajeCuentasDevolucion,
  mensajeErrorCierre,
  puedeConfirmarCierreCajaChica,
} from '../services/cajaChicaCierreLogic.js';

const EPSILON = 0.005;
const monedaTexto = moneda => String(moneda || 'PEN').toUpperCase();
const moneyText = (value, moneda) => `${Number(value || 0).toFixed(2)} ${monedaTexto(moneda)}`;

export function CerrarFondoModal({
  fondo,
  fondos = [],
  cuentasBancarias = [],
  modoVistaSociedad,
  cerrarFondoAtomico,
  supabaseMode = true,
  onClose,
  onCompleted,
  addToast,
}) {
  const saldo = Number(fondo?.saldo_disponible || 0);
  const saldoNegativo = saldo < -EPSILON;
  const saldoPositivo = saldo > EPSILON;
  const [requiereDestino, setRequiereDestino] = useState(saldoPositivo);
  const [destinoTipo, setDestinoTipo] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [finalizado, setFinalizado] = useState(false);

  const alcance = useMemo(
    () => adaptarAlcanceCuentasCajaChica(modoVistaSociedad),
    [modoVistaSociedad],
  );
  const destinosTransferencia = useMemo(
    () => filtrarDestinosTransferencia(fondo, fondos),
    [fondo, fondos],
  );
  const cuentasDevolucion = useMemo(
    () => filtrarCuentasDevolucion(fondo, cuentasBancarias, alcance),
    [fondo, cuentasBancarias, alcance],
  );
  const puedeTransferir = Boolean(fondo?.sociedad_id);
  const requiereDestinoVisible = requiereDestino || saldoPositivo;
  const destinosDisponibles = destinosTransferencia.length > 0 || cuentasDevolucion.length > 0;

  useEffect(() => {
    if (!requiereDestinoVisible) return;
    if (destinoTipo === 'transferencia' && puedeTransferir && destinosTransferencia.length > 0) return;
    if (destinoTipo === 'cuenta_bancaria' && cuentasDevolucion.length > 0) return;
    const opcionesDisponibles = Number(puedeTransferir && destinosTransferencia.length > 0)
      + Number(cuentasDevolucion.length > 0);
    if (opcionesDisponibles === 1 && puedeTransferir && destinosTransferencia.length > 0) {
      setDestinoTipo('transferencia');
      setDestinoId('');
    } else if (opcionesDisponibles === 1 && cuentasDevolucion.length > 0) {
      setDestinoTipo('cuenta_bancaria');
      setDestinoId('');
    } else {
      setDestinoTipo('');
      setDestinoId('');
    }
  }, [requiereDestinoVisible, destinoTipo, puedeTransferir, destinosTransferencia.length, cuentasDevolucion.length]);

  const destinosActuales = destinoTipo === 'transferencia' ? destinosTransferencia : cuentasDevolucion;
  const sinDestinosActuales = requiereDestinoVisible && destinoTipo && destinosActuales.length === 0;
  const mensajeCuentas = mensajeCuentasDevolucion(alcance, cuentasDevolucion);
  const puedeConfirmar = puedeConfirmarCierreCajaChica({
    guardando,
    finalizado,
    supabaseMode,
    saldoNegativo,
    requiereDestinoVisible,
    destinoTipo,
    destinoId,
    sinDestinosActuales,
  });

  const seleccionarTipo = tipo => {
    setDestinoTipo(tipo);
    setDestinoId('');
    setError('');
  };

  const confirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError('');
    const args = requiereDestinoVisible
      ? { destino_tipo: destinoTipo, destino_id: destinoId, referencia: referencia.trim() || null }
      : { referencia: referencia.trim() || null };

    try {
      await cerrarFondoAtomico(fondo.id, args);
      setFinalizado(true);
      try {
        await onCompleted?.();
      } catch (refreshError) {
        const mensaje = MENSAJE_CIERRE_EXITO_REFRESH_FALLIDO;
        setError(mensaje);
        addToast?.(mensaje, 'error');
      }
    } catch (err) {
      const codigo = extraerCodigoErrorCierre(err);
      const mensaje = mensajeErrorCierre(err);
      if (codigo === 'DESTINO_REQUERIDO') setRequiereDestino(true);
      setError(mensaje);
      addToast?.(mensaje, 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={guardando ? undefined : onClose} />
      <div className="side-panel" role="dialog" aria-modal="true" aria-label="Cerrar fondo de Caja Chica" style={{ width: 'min(560px,96vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Caja Chica</div>
            <div className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>Cerrar fondo</div>
          </div>
          <button type="button" className="icon-btn" disabled={guardando} onClick={onClose}>{I.x}</button>
        </div>
        <div className="side-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
            <div className="kpi-label">Fondo</div>
            <strong>{fondo?.nombre || fondo?.id}</strong>
            <div className="text-muted" style={{ marginTop: 4 }}>
              Saldo recalculado en pantalla: {moneyText(saldo, fondo?.moneda)}
            </div>
          </div>

          {fondo?.moneda_inconsistente && (
            <div className="alert alert-warning">
              Este fondo contiene movimientos con una moneda distinta. La base de datos volverá a calcular el saldo antes de cerrar.
            </div>
          )}

          {saldoNegativo && (
            <div className="alert alert-danger">
              No se puede cerrar el fondo porque su saldo recalculado es negativo.
            </div>
          )}

          {!supabaseMode && (
            <div className="alert alert-warning" role="status">{MENSAJE_CIERRE_MODO_DEMO}</div>
          )}

          {!saldoNegativo && requiereDestinoVisible && (
            <>
              <div className="input-group">
                <label>Destino del saldo positivo *</label>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button type="button" className={destinoTipo === 'transferencia' ? 'btn btn-primary' : 'btn btn-secondary'} aria-pressed={destinoTipo === 'transferencia'} disabled={!puedeTransferir || destinosTransferencia.length === 0} onClick={() => seleccionarTipo('transferencia')}>
                    Transferir a otra caja
                  </button>
                  {!puedeTransferir && <div className="text-muted" style={{ fontSize: 12 }}>Este fondo no tiene sociedad clasificada y no puede transferirse a otra caja.</div>}
                  {puedeTransferir && destinosTransferencia.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No hay otra caja activa en la misma moneda y sociedad.</div>}
                  <button type="button" className={destinoTipo === 'cuenta_bancaria' ? 'btn btn-primary' : 'btn btn-secondary'} aria-pressed={destinoTipo === 'cuenta_bancaria'} disabled={cuentasDevolucion.length === 0} onClick={() => seleccionarTipo('cuenta_bancaria')}>
                    Devolver a cuenta bancaria
                  </button>
                  {mensajeCuentas && <div className="text-muted" style={{ fontSize: 12 }}>{mensajeCuentas}</div>}
                </div>
              </div>

              {destinoTipo && destinosActuales.length > 0 && (
                <div className="input-group">
                  <label>{destinoTipo === 'transferencia' ? 'Caja destino *' : 'Cuenta bancaria destino *'}</label>
                  <select className="select" value={destinoId} onChange={event => setDestinoId(event.target.value)}>
                    <option value="">- Seleccionar destino -</option>
                    {destinosActuales.map(destino => (
                      <option key={destino.id} value={destino.id}>
                        {destinoTipo === 'transferencia'
                          ? (destino.nombre || destino.id)
                          : `${destino.banco || 'Banco'} - ${destino.nombre || destino.id} · ${monedaTexto(destino.moneda)} · ****${String(destino.numero_cuenta || '').replace(/\s/g, '').slice(-4) || '—'}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!destinosDisponibles && (
                <div className="alert alert-warning">No hay ningún destino elegible para este saldo. No se puede confirmar el cierre.</div>
              )}
            </>
          )}

          {!saldoNegativo && !requiereDestinoVisible && (
            <div>El saldo es cero. Confirma el cierre del fondo.</div>
          )}

          <div className="input-group">
            <label>Referencia opcional</label>
            <input className="input" value={referencia} onChange={event => setReferencia(event.target.value)} maxLength={200} />
          </div>

          {finalizado && !error && <div className="alert" role="status" style={{ borderColor: 'var(--green)', background: 'var(--green-lt)', color: 'var(--green-dk)' }}>El fondo se cerró correctamente.</div>}
          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={guardando} onClick={onClose}>{finalizado ? 'Cerrar' : 'Cancelar'}</button>
            {!finalizado && <button type="button" className="btn btn-primary" disabled={!puedeConfirmar} onClick={confirmar}>
              {guardando ? 'Cerrando...' : 'Confirmar cierre'}
            </button>}
          </div>
        </div>
      </div>
    </>
  );
}

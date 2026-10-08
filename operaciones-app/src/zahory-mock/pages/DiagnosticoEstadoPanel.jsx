import React, { useEffect, useRef, useState } from 'react';
import { emitirDiagnosticoTecnico, listarHistorialEstadosDiagnostico, reabrirDiagnosticoTecnico } from '../../services/diagnosticoTecnicoService.js';

export function DiagnosticoEstadoPanel({ empresaId, diagnostico, puedeAprobar, permiteEscritura, cambiosSinGuardar, onCambioCompleto, informeAction = null }) {
  const [historial, setHistorial] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [dialogo, setDialogo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const cargarHistorial = async () => {
    setLoadingHistory(true);
    setHistoryError('');
    try { setHistorial(await listarHistorialEstadosDiagnostico(empresaId, diagnostico.id)); }
    catch (loadError) { setHistoryError(loadError.message || 'No se pudo cargar el historial.'); }
    finally { setLoadingHistory(false); }
  };
  useEffect(() => { cargarHistorial(); }, [empresaId, diagnostico.id]);

  const confirmar = async () => {
    if (busyRef.current || busy || (dialogo === 'emitir' && cambiosSinGuardar) || (dialogo === 'reabrir' && motivo.trim().length < 10)) return;
    busyRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const resultado = dialogo === 'emitir'
        ? await emitirDiagnosticoTecnico(diagnostico.id)
        : await reabrirDiagnosticoTecnico(diagnostico.id, motivo.trim());
      setDialogo(''); setMotivo('');
      setNotice(dialogo === 'emitir' ? 'Diagnóstico emitido correctamente.' : 'Diagnóstico reabierto correctamente.');
      await Promise.all([cargarHistorial(), onCambioCompleto(resultado)]);
    } catch (requestError) {
      const message = requestError?.code === '42501'
        ? `No tienes permiso para ${dialogo === 'emitir' ? 'emitir' : 'reabrir'} el diagnóstico.`
        : requestError?.code === 'P0002'
          ? 'El diagnóstico ya no existe.'
          : requestError?.code === '22023' && requestError.message
            ? requestError.message
            : requestError.message || 'No se pudo cambiar el estado del diagnóstico.';
      setError(message);
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  const visibleEmitir = diagnostico.estado === 'borrador' && puedeAprobar && permiteEscritura;
  const visibleReabrir = diagnostico.estado === 'emitido' && puedeAprobar && permiteEscritura;
  const corto = motivo.trim().length < 10;
  const transicion = row => `${row.estado_anterior === 'borrador' ? 'Borrador' : 'Emitido'} → ${row.estado_nuevo === 'emitido' ? 'Emitido' : 'Borrador'}`;

  return <section className="diagnostico-estado-panel card-body">
    {(visibleEmitir || visibleReabrir || informeAction) && <div className="diagnostico-estado-actions dx-action-bar">
      {visibleEmitir && <div>
        <button type="button" className="btn btn-primary" disabled={busy || cambiosSinGuardar} title={cambiosSinGuardar ? 'Guarda los cambios antes de emitir' : undefined} onClick={() => { setError(''); setDialogo('emitir'); }}>Emitir diagnóstico</button>
        {cambiosSinGuardar && <div className="muted" role="status">Guarda los cambios antes de emitir</div>}
      </div>}
      {visibleReabrir && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setError(''); setMotivo(''); setDialogo('reabrir'); }}>Reabrir diagnóstico</button>}
      {informeAction}
    </div>}
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    <button type="button" className="diagnostico-estado-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>
      <span aria-hidden="true">{historyOpen ? '▾' : '›'}</span> Historial de estados ({loadingHistory ? '…' : historial.length})
    </button>
    {historyOpen && (loadingHistory ? <div className="muted">Cargando historial...</div> : historyError ? <div className="alert alert-error">{historyError}</div> : historial.length === 0 ? <div className="muted">Sin movimientos registrados.</div> : <ol className="diagnostico-estado-history">
      {historial.map(row => <li key={row.id}>
        <div><strong>{transicion(row)}</strong> · {row.ocurrido_en ? new Date(row.ocurrido_en).toLocaleString('es-PE') : '—'}</div>
        <div className="muted">{row.usuario_nombre}</div>
        {row.estado_anterior === 'emitido' && row.estado_nuevo === 'borrador' && row.motivo && <div>Motivo: {row.motivo}</div>}
      </li>)}
    </ol>)}
    {dialogo && <div className="diagnostico-estado-dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostico-estado-titulo" onKeyDown={event => { if (event.key === 'Escape' && !busy) setDialogo(''); }}>
      <div className="card">
        <div className="card-header"><h3 id="diagnostico-estado-titulo">{dialogo === 'emitir' ? 'Emitir diagnóstico' : 'Reabrir diagnóstico'}</h3></div>
        <div className="card-body">
          {dialogo === 'emitir' ? <p>Al emitir, el diagnóstico quedará bloqueado. Solo un aprobador podrá reabrirlo e indicar un motivo.</p> : <>
            <div className="field">
              <label htmlFor="diagnostico-reapertura-motivo">Motivo de reapertura</label>
              <textarea id="diagnostico-reapertura-motivo" className="input" value={motivo} onChange={event => setMotivo(event.target.value)} rows={4} required autoFocus aria-describedby="diagnostico-reapertura-contador" />
            </div>
            <div id="diagnostico-reapertura-contador" className="muted" aria-live="polite">{motivo.trim().length} caracteres (mínimo 10).</div>
            {corto && <div className="alert alert-warning">Ingresa un motivo de al menos 10 caracteres, sin contar espacios al inicio o al final.</div>}
          </>}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
        </div>
        <div className="card-body diagnostico-estado-dialog-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setDialogo('')}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={busy || (dialogo === 'emitir' && cambiosSinGuardar) || (dialogo === 'reabrir' && corto)} onClick={confirmar}>{busy ? 'Procesando...' : dialogo === 'emitir' ? 'Confirmar emisión' : 'Confirmar reapertura'}</button>
        </div>
      </div>
    </div>}
  </section>;
}

import React, { useState } from 'react';
import { actualizarFotoHallazgo, borrarFotoHallazgo, listarFotosHallazgos, subirFotoHallazgo } from '../../services/diagnosticoHallazgoFotosService.js';

const errorText = error => error?.message || 'No se pudo completar la operación.';

export default function HallazgoFotos({ empresaId, diagnosticoId, hallazgo, fotos = [], readOnly = false, onFotosChange }) {
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [leyendas, setLeyendas] = useState({});
  const [exclusiones, setExclusiones] = useState({});
  const publish = next => onFotosChange?.(next);

  const updateFoto = async (foto, changes) => {
    setError(''); setNotice(''); setBusyId(foto.id);
    try {
      const saved = await actualizarFotoHallazgo({ empresaId, id: foto.id, leyenda: changes.leyenda ?? foto.leyenda, excluir_del_informe: changes.excluir_del_informe ?? foto.excluir_del_informe });
      publish(fotos.map(row => row.id === foto.id ? { ...row, ...saved } : row));
      setLeyendas(current => ({ ...current, [foto.id]: saved.leyenda ?? '' }));
      setExclusiones(current => ({ ...current, [foto.id]: Boolean(saved.excluir_del_informe) }));
    } catch (cause) {
      setError(errorText(cause));
      setLeyendas(current => ({ ...current, [foto.id]: foto.leyenda ?? '' }));
      setExclusiones(current => ({ ...current, [foto.id]: Boolean(foto.excluir_del_informe) }));
    }
    finally { setBusyId(null); }
  };

  const uploadFiles = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!hallazgo?.id || !files.length) return;
    setError(''); setNotice(''); setUploading(true);
    let next = fotos;
    let didUpload = false;
    try {
      for (const file of files) {
        if (next.length >= 3) break;
        const foto = await subirFotoHallazgo({ empresaId, diagnosticoId, hallazgoId: hallazgo.id, archivo: file, leyenda: '' });
        next = [...next, foto]; didUpload = true; publish(next);
      }
    } catch (cause) { setError(errorText(cause)); }
    finally {
      if (didUpload) {
        try { publish(await listarFotosHallazgos(empresaId, [hallazgo.id])); }
        catch (cause) { setError(errorText(cause)); }
      }
      setUploading(false);
    }
  };

  const removeFoto = async foto => {
    setError(''); setNotice(''); setBusyId(foto.id);
    try {
      const result = await borrarFotoHallazgo({ empresaId, id: foto.id, rutaStorage: foto.ruta_storage });
      publish(fotos.filter(row => row.id !== foto.id)); setConfirmId(null);
      if (result?.huerfana) setNotice('La foto se quitó, pero el archivo quedó pendiente de limpieza.');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusyId(null); }
  };

  return <section className="dx-foto-section" aria-label="Fotos del hallazgo">
    <div className="dx-foto-head"><strong>Fotos</strong><span>{fotos.length} de 3</span></div>
    {!hallazgo?.id && <p className="dx-foto-muted">Guarda el hallazgo para agregar fotos</p>}
    {!readOnly && hallazgo?.id && <label className="dx-foto-upload">
      <span>{uploading ? 'Subiendo fotos…' : 'Agregar fotos'}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || fotos.length >= 3} onChange={uploadFiles} />
    </label>}
    {fotos.length > 0 && <div className="dx-foto-grid">{fotos.map(foto => {
      const busy = busyId === foto.id;
      return <article className="dx-foto-card" key={foto.id}>
        <img src={foto.signedUrl} alt={foto.leyenda || 'Foto del hallazgo'} />
        <>
          <label className="dx-foto-legend">Leyenda<input type="text" value={leyendas[foto.id] ?? foto.leyenda ?? ''} disabled={busy} onChange={event => setLeyendas(current => ({ ...current, [foto.id]: event.target.value }))} onBlur={event => { if (event.target.value !== (foto.leyenda || '')) updateFoto(foto, { leyenda: event.target.value }); }} /></label>
          <label className="dx-foto-include"><input type="checkbox" checked={!(exclusiones[foto.id] ?? foto.excluir_del_informe)} disabled={busy} onChange={event => { const excluir = !event.target.checked; setExclusiones(current => ({ ...current, [foto.id]: excluir })); updateFoto(foto, { excluir_del_informe: excluir }); }} />Incluir en el informe</label>
          {!readOnly && <div className="dx-foto-actions">{confirmId === foto.id ? <><span>¿Quitar esta foto?</span><button type="button" disabled={busy} onClick={() => removeFoto(foto)}>Confirmar</button><button type="button" disabled={busy} onClick={() => setConfirmId(null)}>Cancelar</button></> : <button type="button" disabled={busy} onClick={() => setConfirmId(foto.id)}>Quitar</button>}{busy && <span>Cargando…</span>}</div>}
        </>
      </article>;
    })}</div>}
    {error && <p className="dx-foto-error" role="alert">{error}</p>}
    {notice && <p className="dx-foto-notice" role="status">{notice}</p>}
  </section>;
}

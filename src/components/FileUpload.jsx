import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { I } from '../icons.jsx';
import * as storageService from '../services/storageService.js';

export const FileUpload = forwardRef(function FileUpload({
  entidadTipo,
  entidadId,
  empresaId,
  categoria = 'adjunto',
  multiple = false,
  descripcion = null,
  subidoPor = null,
  deferUpload = false,
  disabled = false,
  soloImagenes = false,
  soloUltimo = false,
  onUploaded,
}, ref) {
  const inputRef = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const reloadAdjuntos = async () => {
    if (!empresaId || !entidadTipo || !entidadId) {
      setAdjuntos([]);
      return [];
    }

    setLoading(true);
    try {
      const rows = await storageService.cargarAdjuntos({ empresaId, entidadTipo, entidadId });
      setAdjuntos(rows);
      return rows;
    } catch (loadError) {
      setError(loadError.message || 'No se pudieron cargar los adjuntos.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadAdjuntos();
  }, [empresaId, entidadTipo, entidadId]);

  const agregarArchivos = fileList => {
    const files = Array.from(fileList || []);
    const selectedFiles = multiple ? files : files.slice(0, 1);
    const invalid = selectedFiles.map(file => ({
      file,
      validation: storageService.validarArchivo(file),
    })).find(item => !item.validation.ok);

    if (invalid) {
      setError(invalid.validation.error);
      return;
    }

    if (soloImagenes) {
      const noEsImagen = selectedFiles.find(file => !/^image\/(jpeg|png)$/i.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name));
      if (noEsImagen) {
        setError('Solo se permiten imágenes JPG o PNG.');
        return;
      }
    }

    setError('');
    setPendingFiles(prev => (multiple ? [...prev, ...selectedFiles] : selectedFiles));
  };

  const clearPendingFiles = () => {
    setPendingFiles([]);
    setProgress(0);
    setError('');
  };

  const uploadPendingFiles = async () => {
    if (!pendingFiles.length) return [];
    if (!empresaId || !entidadTipo || !entidadId) {
      const message = 'Falta la entidad destino para subir adjuntos.';
      setError(message);
      throw new Error(message);
    }

    setUploading(true);
    setProgress(5);
    setError('');

    const uploaded = [];
    try {
      for (let index = 0; index < pendingFiles.length; index += 1) {
        const file = pendingFiles[index];
        const baseProgress = Math.round((index / pendingFiles.length) * 90);
        const adjunto = await storageService.subirAdjunto({
          empresaId,
          entidadTipo,
          entidadId,
          file,
          categoria,
          descripcion,
          subidoPor,
          onProgress: value => {
            const scopedProgress = baseProgress + Math.round((Number(value || 0) / pendingFiles.length) * 0.9);
            setProgress(Math.min(99, Math.max(5, scopedProgress)));
          },
        });
        uploaded.push(adjunto);
      }

      setAdjuntos(prev => [...uploaded, ...prev]);
      setPendingFiles([]);
      setProgress(100);
      if (typeof onUploaded === 'function') onUploaded(uploaded);
      return uploaded;
    } catch (uploadError) {
      setError(uploadError.message || 'No se pudo subir el archivo.');
      throw uploadError;
    } finally {
      setUploading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    uploadPendingFiles,
    clearPendingFiles,
    reloadAdjuntos,
  }));

  const abrirSelector = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  const onDrop = event => {
    event.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    agregarArchivos(event.dataTransfer.files);
  };

  const abrirAdjunto = async adjunto => {
    try {
      const url = await storageService.obtenerUrlAdjunto(adjunto);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(openError.message || 'No se pudo abrir el adjunto.');
    }
  };

  const eliminarAdjunto = async adjunto => {
    setDeletingId(adjunto.id);
    setError('');
    try {
      await storageService.eliminarAdjunto(adjunto);
      setAdjuntos(prev => prev.filter(item => item.id !== adjunto.id));
    } catch (deleteError) {
      setError(deleteError.message || 'No se pudo eliminar el adjunto.');
    } finally {
      setDeletingId(null);
    }
  };

  const quitarPendiente = fileIndex => {
    setPendingFiles(prev => prev.filter((_, index) => index !== fileIndex));
  };

  const pendingItems = pendingFiles.map((file, index) => (
    <div key={`${file.name}-${file.size}-${index}`} className="row" style={{justifyContent:'space-between', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border-subtle)'}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{file.name}</div>
        <div className="text-muted" style={{fontSize:11}}>{storageService.formatoTamano(file.size)}</div>
      </div>
      <button type="button" className="icon-btn" title="Quitar" onClick={() => quitarPendiente(index)} disabled={uploading || disabled}>
        {I.x}
      </button>
    </div>
  ));

  const adjuntosVisibles = soloUltimo ? adjuntos.slice(0, 1) : adjuntos;
  const adjuntoItems = adjuntosVisibles.map(adjunto => (
    <div key={adjunto.id} className="row" style={{justifyContent:'space-between', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border-subtle)'}}>
      <button type="button" className="btn btn-ghost" onClick={() => abrirAdjunto(adjunto)} style={{justifyContent:'flex-start', minWidth:0, padding:0}}>
        <span style={{width:18, height:18, display:'inline-flex'}}>{I.file}</span>
        <span style={{minWidth:0, textAlign:'left'}}>
          <span style={{display:'block', fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{adjunto.nombre_original}</span>
          <span className="text-muted" style={{display:'block', fontSize:11}}>{storageService.formatoTamano(adjunto.tamano_bytes)} - {adjunto.categoria || 'adjunto'}</span>
        </span>
      </button>
      <button type="button" className="icon-btn" title="Eliminar" onClick={() => eliminarAdjunto(adjunto)} disabled={disabled || deletingId === adjunto.id}>
        {I.trash}
      </button>
    </div>
  ));

  const totalAdjuntos = adjuntosVisibles.length + pendingFiles.length;
  const dropBorder = dragging ? '1px solid var(--cyan)' : '1px dashed var(--border)';
  const uploadButton = !deferUpload && pendingFiles.length ? (
    <button type="button" className="btn btn-secondary btn-sm" onClick={uploadPendingFiles} disabled={uploading || disabled}>
      {uploading ? 'Subiendo...' : 'Subir adjuntos'}
    </button>
  ) : null;
  const progressBlock = uploading ? (
    <div style={{height:6, borderRadius:999, background:'var(--slate-100)', overflow:'hidden', marginTop:10}}>
      <div style={{height:'100%', width:`${progress}%`, background:'var(--cyan)', transition:'width 160ms ease'}} />
    </div>
  ) : null;
  const pendingBlock = pendingItems.length ? (
    <div style={{marginTop:12}}>
      <div className="text-muted" style={{fontSize:11, fontWeight:700, textTransform:'uppercase', marginBottom:4}}>Seleccionados</div>
      {pendingItems}
    </div>
  ) : null;
  const adjuntosBlock = adjuntoItems.length ? adjuntoItems : (
    <div className="text-muted" style={{fontSize:12, padding:'10px 0'}}>Sin adjuntos.</div>
  );

  return (
    <div className="card" style={{padding:0}}>
      <div className="card-head">
        <h3>Adjuntos</h3>
        <span className="badge badge-gray">{totalAdjuntos}</span>
      </div>
      <div style={{padding:16}}>
        <div
          role="button"
          tabIndex={0}
          onClick={abrirSelector}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') abrirSelector(); }}
          onDragOver={event => { event.preventDefault(); if (!disabled && !uploading) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: dropBorder,
            borderRadius:8,
            padding:16,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
            background: dragging ? 'var(--cyan-lt)' : 'var(--surface)',
          }}
        >
          <div className="row" style={{gap:10, alignItems:'center'}}>
            <span style={{width:28, height:28, display:'inline-flex', color:'var(--cyan)'}}>{I.file}</span>
            <div>
              <div className="font-display" style={{fontSize:13, fontWeight:700}}>Adjuntar archivo</div>
              <div className="text-muted" style={{fontSize:11}}>{soloImagenes ? 'Imagen JPG o PNG - max. 20 MB' : 'PDF, imagen u Office - max. 20 MB'}</div>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple={multiple}
            disabled={disabled || uploading}
            accept={soloImagenes ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
            onChange={event => {
              agregarArchivos(event.target.files);
              event.target.value = '';
            }}
            style={{display:'none'}}
          />
        </div>

        {error && <div style={{color:'var(--danger)', fontSize:12, marginTop:8}}>{error}</div>}
        {progressBlock}
        {pendingBlock}

        <div className="row" style={{justifyContent:'space-between', marginTop:12}}>
          <div className="text-muted" style={{fontSize:11}}>{loading ? 'Cargando adjuntos...' : soloUltimo ? 'Archivo vigente' : 'Archivos vinculados'}</div>
          {uploadButton}
        </div>
        <div style={{marginTop:4}}>{adjuntosBlock}</div>
      </div>
    </div>
  );
});

export default FileUpload;

import React, { useState, useEffect } from 'react';
import { I } from '../icons.jsx';

const HAB_DOC_LABEL = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  falta: 'Falta',
  en_revision: 'En revisión',
  rechazado: 'Rechazado',
  incompleto: 'Incompleto',
  anulado: 'Anulado',
};

const HAB_DOC_BADGE = {
  vigente: 'badge-green',
  por_vencer: 'badge-orange',
  vencido: 'badge-red',
  falta: 'badge-gray',
  en_revision: 'badge-cyan',
  rechazado: 'badge-red',
  incompleto: 'badge-orange',
  anulado: 'badge-gray',
};

const habMimeKind = (doc = {}, url = '') => {
  const raw = `${doc.nombre_archivo || ''} ${doc.mime_type || doc.content_type || ''} ${url || doc.archivo_url || ''}`.toLowerCase();
  if (raw.includes('application/pdf') || raw.includes('.pdf')) return 'pdf';
  if (raw.includes('image/') || /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(raw)) return 'image';
  return 'other';
};

const habDiasTexto = (dias) => {
  if (dias === null || dias === undefined || dias === '') return '';
  const n = Number(dias);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'vence hoy';
  return n > 0 ? `quedan ${n} días` : `venció hace ${Math.abs(n)} días`;
};

const fmtUser = (id) => {
  if (!id) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) + '…' : id;
};

export function DocumentoPreviewModal({
  req,
  persona,
  url,
  loadingUrl,
  canValidate,
  validatingId,
  onClose,
  onReplace,
  onCorregir,
  onNuevaVersion,
  onNuevoContrato,
  onValidate,
  onDownload,
}) {
  const [imgFit, setImgFit] = useState('fit');
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState('');
  
  // Historical versions state
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [viewingHistoryDoc, setViewingHistoryDoc] = useState(null);
  const [historyUrl, setHistoryUrl] = useState('');
  const [loadingHistoryUrl, setLoadingHistoryUrl] = useState(false);
  const [anulandoId, setAnulandoId] = useState(null);
  const [anularMotivo, setAnularMotivo] = useState('');

  useEffect(() => {
    if (!req?.doc?.id || !req?.doc?.personal_id || !req?.doc?.tipo_doc) return;
    let mounted = true;
    const fetchHistorial = async () => {
      setLoadingHistorial(true);
      try {
        const { getSupabaseClient, isSupabaseConfigured } = await import('../lib/supabaseClient.js');
        if (!isSupabaseConfigured()) {
          // MOCK mode support
          if (mounted) setHistorial([]);
          return;
        }
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
          .from('personal_documentos')
          .select('*')
          .eq('personal_id', req.doc.personal_id)
          .eq('tipo_doc', req.doc.tipo_doc)
          .eq('activo', false)
          .order('version', { ascending: false });
        if (error) throw error;
        if (mounted) setHistorial(data || []);
      } catch (err) {
        console.error('Error fetching historial:', err);
      } finally {
        if (mounted) setLoadingHistorial(false);
      }
    };
    fetchHistorial();
    return () => { mounted = false; };
  }, [req?.doc?.id, req?.doc?.personal_id, req?.doc?.tipo_doc]);

  if (!req?.doc) return null;
  const doc = req.doc;
  const activeDoc = viewingHistoryDoc || doc;
  const activeUrl = viewingHistoryDoc ? historyUrl : url;
  const activeLoading = viewingHistoryDoc ? loadingHistoryUrl : loadingUrl;
  
  const kind = habMimeKind(activeDoc, activeUrl);
  const estado = viewingHistoryDoc ? activeDoc.estado_validacion : (req.estado || doc.estado);
  const dias = viewingHistoryDoc ? null : habDiasTexto(req.dias_restantes);
  const puedeValidar = Boolean(
    !viewingHistoryDoc &&
    canValidate &&
    doc.estado_validacion === 'pendiente' &&
    req.tipo?.requiere_validacion
  );

  const metaRow = (label, value, tone) => value ? (
    <div style={{display:'grid', gap:3}}>
      <div style={{fontSize:10, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'0.05em'}}>{label}</div>
      <div style={{fontSize:12, color:tone || 'var(--fg)', wordBreak:'break-word'}}>{value}</div>
    </div>
  ) : null;

  const confirmarRechazo = () => {
    if (!motivo.trim()) return;
    onValidate(doc.id, 'rechazado', motivo.trim());
    setRejecting(false);
    setMotivo('');
  };

  const handleVerHistorico = async (hDoc) => {
    setViewingHistoryDoc(hDoc);
    setHistoryUrl('');
    setLoadingHistoryUrl(true);
    try {
      const { renovarUrlDocumento } = await import('../services/personalDocumentosService.js');
      const renewedUrl = await renovarUrlDocumento(hDoc.storage_path || hDoc.archivo_url);
      setHistoryUrl(renewedUrl);
    } catch (e) {
      setHistoryUrl(hDoc.archivo_url || '');
    } finally {
      setLoadingHistoryUrl(false);
    }
  };

  const confirmarAnular = async (hDocId) => {
    if (!anularMotivo.trim()) return;
    try {
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from('personal_documentos')
        .update({
          estado_validacion: 'anulado',
          motivo_rechazo: anularMotivo.trim(),
        })
        .eq('id', hDocId);
      if (error) throw error;
      setHistorial(prev => prev.map(h => h.id === hDocId ? { ...h, estado_validacion: 'anulado', motivo_rechazo: anularMotivo.trim() } : h));
      setAnulandoId(null);
      setAnularMotivo('');
    } catch (e) {
      console.error(e);
      alert('Error al anular: ' + e.message);
    }
  };

  const handleDownload = () => {
    if (viewingHistoryDoc && activeUrl) {
      window.open(activeUrl, '_blank', 'noopener,noreferrer');
    } else {
      if (onDownload) onDownload();
    }
  };

  const subidoPor = activeDoc.subido_por_nombre || fmtUser(activeDoc.subido_por);
  const validadoPor = activeDoc.revisado_por_nombre || fmtUser(activeDoc.revisado_por);

  const esContratoDoc = Boolean(req.tipo?.captura_snapshot_laboral && !req.tipo?.documento_padre_tipo_id);
  const diasRestantes = req.dias_restantes != null ? Number(req.dias_restantes) : null;
  const puedeNuevoContrato = !viewingHistoryDoc && esContratoDoc && diasRestantes != null && diasRestantes <= 30;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1140px, 96vw)',
          maxWidth: '1140px',
          maxHeight: '93vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Cabecera ── */}
        <div className="modal-head" style={{flexShrink:0}}>
          <div style={{minWidth:0}}>
            <h3 style={{marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {req.tipo?.nombre || req.tipo_documento_id}
              {viewingHistoryDoc && <span className="badge badge-orange" style={{marginLeft: 8, verticalAlign: 'middle'}}>Viendo versión anterior (v{viewingHistoryDoc.version})</span>}
            </h3>
            <div className="text-muted" style={{fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {persona?.nombre} · {activeDoc.nombre_archivo || 'Documento'}
            </div>
          </div>
          <button className="icon-btn" style={{flexShrink:0}} onClick={onClose}>{I.x}</button>
        </div>

        {/* ── Cuerpo ── */}
        <div
          className="modal-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 300px',
            gap: 16,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Panel izquierdo: visor */}
          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}>
            {activeLoading ? (
              <div className="text-muted" style={{fontSize:13}}>Cargando documento...</div>
            ) : !activeUrl ? (
              <div style={{textAlign:'center', padding:24}}>
                <div style={{fontWeight:600, marginBottom:8}}>No se pudo generar el visor</div>
                <button className="btn btn-secondary btn-sm" onClick={handleDownload}>{I.download} Descargar</button>
              </div>
            ) : kind === 'pdf' ? (
              <iframe
                title={activeDoc.nombre_archivo || 'Documento PDF'}
                src={activeUrl}
                style={{border:0, width:'100%', height:'100%', minHeight:400}}
              />
            ) : kind === 'image' ? (
              <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', minHeight:400}}>
                <div style={{padding:8, borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:6, flexShrink:0}}>
                  <button className={'btn btn-sm ' + (imgFit === 'fit' ? 'btn-primary' : 'btn-ghost')} onClick={() => setImgFit('fit')}>Ajustar</button>
                  <button className={'btn btn-sm ' + (imgFit === 'real' ? 'btn-primary' : 'btn-ghost')} onClick={() => setImgFit('real')}>100%</button>
                </div>
                <div style={{flex:1, overflow:'auto', display:'flex', alignItems:imgFit==='fit'?'center':'flex-start', justifyContent:imgFit==='fit'?'center':'flex-start', padding:16}}>
                  <img src={activeUrl} alt={activeDoc.nombre_archivo || 'Documento'} style={imgFit==='fit'?{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}:{maxWidth:'none'}} />
                </div>
              </div>
            ) : (
              <div style={{textAlign:'center', padding:24}}>
                <div style={{fontWeight:600, marginBottom:8}}>Formato no reconocido</div>
                <div className="text-muted" style={{fontSize:12, marginBottom:14}}>Usa la descarga como respaldo.</div>
                <button className="btn btn-secondary btn-sm" onClick={handleDownload}>{I.download} Descargar</button>
              </div>
            )}
          </div>

          {/* Panel derecho: metadatos + acciones */}
          <aside style={{display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>

            {/* Metadatos — área scrollable */}
            <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, paddingBottom:8, paddingRight:4}}>
              <span className={'badge ' + (HAB_DOC_BADGE[estado] || 'badge-gray')} style={{alignSelf:'flex-start', fontSize:12}}>
                {HAB_DOC_LABEL[estado] || estado}
              </span>
              {metaRow('Tipo', req.tipo?.nombre || req.tipo_documento_id)}
              {metaRow('Emisión', activeDoc.fecha_emision)}
              {metaRow('Vencimiento', [activeDoc.fecha_vencimiento, dias].filter(Boolean).join('  ·  '))}
              {metaRow('Versión', `Versión ${activeDoc.version || 1}${activeDoc.creado_en ? ` · Subida el ${String(activeDoc.creado_en).slice(0,10)}` : ''}`)}
              {metaRow('Subido por', [subidoPor, activeDoc.creado_en ? String(activeDoc.creado_en).slice(0,16).replace('T',' ') : null].filter(Boolean).join('  ·  '))}
              {activeDoc.revisado_en && metaRow('Validado por', [validadoPor, String(activeDoc.revisado_en).slice(0,16).replace('T',' ')].filter(Boolean).join('  ·  '))}
              {activeDoc.motivo_rechazo && metaRow('Motivo de rechazo/anulación', activeDoc.motivo_rechazo, 'var(--danger)')}
              {metaRow('Notas', activeDoc.notas)}

              {/* Historial de versiones */}
              <details style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, userSelect: 'none' }}>
                  Historial de versiones ({historial.length})
                </summary>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {loadingHistorial && <div className="text-muted" style={{ fontSize: 12 }}>Cargando historial...</div>}
                  {!loadingHistorial && historial.length === 0 && (
                    <div className="text-muted" style={{ fontSize: 12 }}>No hay versiones anteriores.</div>
                  )}
                  {historial.map(h => (
                    <div key={h.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 12, background: viewingHistoryDoc?.id === h.id ? 'var(--bg-subtle)' : 'transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong>Versión {h.version || '?'}</strong>
                        <span className={'badge ' + (h.estado_validacion === 'anulado' ? 'badge-gray' : 'badge-red')}>{h.estado_validacion || 'rechazado'}</span>
                      </div>
                      <div className="text-muted" style={{ marginBottom: 4 }}>
                        Subida: {h.creado_en ? String(h.creado_en).slice(0,10) : 'N/A'}
                      </div>
                      <div className="text-muted" style={{ marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {h.nombre_archivo}
                      </div>
                      {anulandoId === h.id ? (
                        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                          <input className="input" style={{ fontSize: 11, padding: '4px 8px' }} placeholder="Motivo obligatorio" value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} />
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-danger btn-sm" disabled={!anularMotivo.trim()} onClick={() => confirmarAnular(h.id)}>Confirmar</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setAnulandoId(null); setAnularMotivo(''); }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          {viewingHistoryDoc?.id !== h.id && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleVerHistorico(h)}>Ver archivo</button>
                          )}
                          {h.estado_validacion !== 'anulado' && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setAnulandoId(h.id)}>Anular versión</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* Acciones — siempre visibles al fondo */}
            <div style={{flexShrink:0, borderTop:'1px solid var(--border)', paddingTop:12, display:'grid', gap:8}}>
              {viewingHistoryDoc ? (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => setViewingHistoryDoc(null)}>Volver a la versión activa</button>
                  <button className="btn btn-secondary btn-sm" onClick={handleDownload}>{I.download} Descargar esta versión</button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={handleDownload}>{I.download} Descargar</button>
                  {puedeValidar && (
                    <>
                      <button className="btn btn-primary btn-sm" disabled={validatingId === doc.id} onClick={() => onValidate(doc.id, 'aprobado')}>
                        {validatingId === doc.id ? 'Procesando...' : 'Validar'}
                      </button>
                      {rejecting ? (
                        <div style={{display:'grid', gap:6}}>
                          <input className="input" style={{fontSize:12}} placeholder="Motivo de rechazo" value={motivo} onChange={e => setMotivo(e.target.value)} />
                          <div className="row" style={{gap:6}}>
                            <button className="btn btn-danger btn-sm" disabled={!motivo.trim() || validatingId === doc.id} onClick={confirmarRechazo}>Confirmar</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(false); setMotivo(''); }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} disabled={validatingId === doc.id} onClick={() => setRejecting(true)}>
                          Rechazar con motivo
                        </button>
                      )}
                    </>
                  )}
                  {esContratoDoc ? (
                    <>
                      {onCorregir && (
                        <button className="btn btn-ghost btn-sm" onClick={onCorregir}>
                          {I.edit || I.upload} Corregir este documento
                        </button>
                      )}
                      {onNuevaVersion && doc.estado_validacion === 'aprobado' && (
                        <button className="btn btn-ghost btn-sm" onClick={onNuevaVersion}>
                          {I.upload} Subir nueva versión
                        </button>
                      )}
                      {onNuevoContrato && puedeNuevoContrato && (
                        <div style={{display:'grid', gap:4}}>
                          <button className="btn btn-ghost btn-sm" style={{color:'var(--orange)'}} onClick={onNuevoContrato}>
                            {I.plus || I.upload} Nuevo contrato
                          </button>
                          <div style={{fontSize:10, color:'var(--fg-muted)', lineHeight:1.4}}>
                            El período anterior quedará archivado. Usar cuando el contrato anterior venció o se terminó.
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    onReplace && (
                      <button className="btn btn-ghost btn-sm" onClick={onReplace}>{I.upload} Reemplazar</button>
                    )
                  )}
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

